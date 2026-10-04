import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createSessionVault, sessionStorage } from "./session-vault.js";
import { createCollaboration } from "./collaboration.js";
test("migration removes legacy session only after secure storage succeeds", () => {
  const store = createStore(":memory:");
  let saved;
  try {
    const secret = {
      access_token: "test-access",
      refresh_token: "test-refresh",
    };
    store.db
      .prepare("INSERT INTO metadata VALUES(?,?)")
      .run("beam_shared_session", JSON.stringify(secret));
    const broken = sessionStorage(store, {
      write() {
        throw Error("Keychain locked");
      },
      read() {
        return null;
      },
    });
    assert.throws(() => broken.get(), /locked/);
    assert.ok(
      store.db
        .prepare("SELECT value FROM metadata WHERE key='beam_shared_session'")
        .get(),
    );
    const sessions = sessionStorage(store, {
      write(value) {
        saved = value;
      },
      read() {
        return saved;
      },
      remove() {
        saved = null;
      },
    });
    assert.deepEqual(sessions.get(), secret);
    assert.equal(
      store.db
        .prepare("SELECT value FROM metadata WHERE key='beam_shared_session'")
        .get(),
      undefined,
    );
    assert.deepEqual(sessions.get(), secret);
    sessions.put(null);
    assert.equal(sessions.get(), null);
  } finally {
    store.db.close();
  }
});
test("vault uses stdin for secrets and an opaque account derived from the database path", () => {
  let value = null;
  const calls = [];
  const vault = createSessionVault(
    { path: "/tmp/beam-test.sqlite" },
    {
      platform: "darwin",
      helper: "/trusted/BeamSecureStore",
      run(file, args, options) {
        const input = JSON.parse(options.input);
        calls.push({ file, args, input });
        if (input.operation === "write") value = input.value;
        if (input.operation === "delete") value = null;
        return {
          status: 0,
          stdout: JSON.stringify(input.operation === "read" ? value : true),
        };
      },
    },
  );
  assert.equal(vault.read(), null);
  vault.write({ refresh_token: "test-secret" });
  assert.deepEqual(vault.read(), { refresh_token: "test-secret" });
  assert.deepEqual(calls[1].args, []);
  assert.match(calls[1].input.account, /^[a-f0-9]{64}$/);
  assert.equal(calls[1].input.value.refresh_token, "test-secret");
  vault.remove();
  assert.equal(vault.read(), null);
});
test("unavailable or denied secure storage never falls back to plaintext", () => {
  const unavailable = createSessionVault(
    { path: "/tmp/unavailable.sqlite" },
    { platform: "linux" },
  );
  assert.throws(
    () => unavailable.write({ access_token: "test" }),
    /indisponible/,
  );
  const denied = createSessionVault(
    { path: "/tmp/denied.sqlite" },
    { platform: "darwin", helper: "/test", run: () => ({ status: 3 }) },
  );
  assert.throws(() => denied.write({ access_token: "test" }), /Trousseau/);
});
test("denied Keychain access keeps the app usable and surfaces one connection error without repeated prompts", async () => {
  const store = createStore(":memory:");
  let calls = 0;
  const collaboration = createCollaboration(store, undefined, store, {
    vault: {
      read() {
        calls++;
        throw Error("Keychain locked");
      },
      write() {
        throw Error("Keychain locked");
      },
      remove() {},
    },
  });
  try {
    assert.equal(collaboration.state().signedIn, false);
    assert.match(collaboration.state().error, /locked/);
    assert.equal(calls, 1);
  } finally {
    await collaboration.close();
    store.db.close();
  }
});
