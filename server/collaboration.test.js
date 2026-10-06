import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import {
  createCollaboration,
  cleanItems,
  replaceItems,
} from "./collaboration.js";
const item = {
  title: "Feature",
  description: "Context",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "private",
  quarter: "T4 2026",
};
function fixture(role = "owner") {
  const store = createStore(":memory:");
  const id = store.save(item);
  const remote = { items: cleanItems(store.list()), revision: 0 };
  const authCalls = [],
    profileCalls = [];
  let session = { user: { id: "user", email: "team@example.test" } };
  const fake = {
    auth: {
      onAuthStateChange() {},
      getSession: async () => ({ data: { session } }),
      setSession: async () => ({ data: { session } }),
      signInWithPassword: async (values) => {
        session = { user: { id: "user", email: "team@example.test" } };
        authCalls.push(values);
        return { data: { session } };
      },
      signUp: async (values) => {
        authCalls.push(values);
        return { data: { session: null } };
      },
      signOut: async () => {
        session = null;
        return { data: {} };
      },
      stopAutoRefresh() {},
    },
    from(table) {
      let filter;
      return {
        select() {
          return this;
        },
        eq(k, v) {
          filter = v;
          return this;
        },
        async single() {
          return {
            data:
              table === "beam_workspaces"
                ? { id: "w", name: "Team", ...(remote.identity || {}) }
                : table === "beam_members"
                  ? { role }
                  : { ...remote },
          };
        },
      };
    },
    rpc: async (name, b) => {
      if (name === "beam_team_members") return { data: remote.members || [] };
      if (name === "beam_workspace_identity") {
        remote.identity = {
          description: b.p_description,
          image: b.p_image,
          identity_configured: true,
        };
        remote.identityWrites = (remote.identityWrites || 0) + 1;
      }
      if (name === "beam_team_profile") {
        profileCalls.push(b);
        if (remote.failProfile) return { error: { message: "offline" } };
      }
      if (name === "beam_create_from_demand") {
        remote.lastConversion = b;
        if (remote.conversionConflict)
          return { error: { message: "BEAM_CONFLICT" } };
        if (b.p_revision !== remote.revision)
          return { error: { message: "BEAM_CONFLICT" } };
        remote.items = b.p_items;
        return { data: ++remote.revision };
      }
      if (name === "beam_save_roadmap") {
        if (b.p_revision !== remote.revision)
          return { error: { message: "BEAM_CONFLICT" } };
        remote.items = b.p_items;
        return { data: ++remote.revision };
      }
      return { data: "w" };
    },
    channel() {
      remote.subscriptions = (remote.subscriptions || 0) + 1;
      return {
        async track(value) {
          remote.lastPresence = value;
        },
        presenceState() {
          return remote.peers || {};
        },
        on(kind, filter, callback) {
          if (kind === "presence") remote.syncPresence = callback;
          return this;
        },
        subscribe(callback) {
          remote.channelCallback = callback;
          callback?.("SUBSCRIBED");
          return this;
        },
      };
    },
    removeChannel: async () => {},
  };
  const c = createCollaboration(store, () => fake);
  return { store, id, remote, c, authCalls, profileCalls };
}
async function connect(f) {
  await f.c.settings("login", {
    email: "team@example.test",
    password: "password123",
  });
  await f.c.settings("select", { id: "w" });
}
test("Only roadmap fields are shared, never arbitrary metadata or note content", () => {
  const s = createStore(":memory:");
  s.save(item);
  const rows = cleanItems(
    s.list().map((i) => ({
      ...i,
      token: "secret",
      notes: "private note",
      _revision: 42,
    })),
  );
  assert.equal(rows[0].token, undefined);
  assert.equal(rows[0].notes, undefined);
  assert.equal(rows[0]._revision, undefined);
  s.db.close();
});
test("Remote revisions reject concurrent writes without losing either roadmap", async () => {
  const f = fixture();
  try {
    await connect(f);
    f.remote.revision = 1;
    f.remote.items[0].title = "Colleague";
    const r = await f.c.items("PATCH", "/api/admin/items/" + f.id, {
      title: "Mine",
      _revision: 0,
    });
    assert.equal(r.status, 409);
    assert.equal(f.store.list()[0].title, "Colleague");
    assert.equal(f.remote.items[0].title, "Colleague");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Reader cannot save, reorder or delete roadmap items", async () => {
  const f = fixture("viewer");
  try {
    await connect(f);
    for (const path of [
      "/api/admin/items/" + f.id,
      "/api/admin/items/reorder",
      "/api/admin/items/kanban",
    ])
      assert.equal(
        (await f.c.items("POST", path, { _revision: 0 })).status,
        403,
      );
    assert.equal(f.remote.revision, 0);
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Saving updates both shared revision and local AI cache; disabling collaboration retains current roadmap", async () => {
  const f = fixture();
  try {
    await connect(f);
    const r = await f.c.items("PATCH", "/api/admin/items/" + f.id, {
      title: "Shared edit",
      _revision: 0,
    });
    assert.equal(r.status, 200);
    assert.equal(f.remote.items[0].title, "Shared edit");
    assert.equal(f.c.state().workspace.revision, 1);
    await f.c.settings("disconnect");
    assert.equal(f.store.list()[0].title, "Shared edit");
    assert.equal(f.remote.items[0].title, "Shared edit");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Old client revision is rejected even after realtime refresh", async () => {
  const f = fixture();
  try {
    await connect(f);
    f.remote.revision = 2;
    await f.c.items("GET", "/api/admin/items");
    assert.equal(
      (
        await f.c.items("PATCH", "/api/admin/items/" + f.id, {
          title: "stale",
          _revision: 0,
        })
      ).status,
      409,
    );
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Failed snapshot import rolls back instead of emptying the local roadmap", () => {
  const f = fixture();
  assert.throws(() => replaceItems(f.store, [{ id: f.id }]));
  assert.equal(f.store.list()[0].title, "Feature");
  void f.c.close();
  f.store.db.close();
});

test("Account creation requests confirmation and normalizes email without retaining the password", async () => {
  const f = fixture();
  try {
    const result = await f.c.settings("signup", {
      email: " team@example.test ",
      password: "password123",
    });
    assert.equal(result.confirmationRequired, true);
    assert.equal(result.signedIn, false);
    assert.equal(f.authCalls[0].email, "team@example.test");
    const metadata = JSON.stringify(
      f.store.db.prepare("SELECT * FROM metadata").all(),
    );
    assert.equal(metadata.includes("password123"), false);
    for (const values of [
      { email: "bad", password: "password123" },
      { email: "team@example.test", password: "short" },
      { email: "team@example.test", password: "x".repeat(129) },
    ]) {
      await assert.rejects(f.c.settings("signup", values), /requis/);
    }
    assert.equal(f.authCalls.length, 1);
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});

test("Personal identity syncs automatically, excludes contact email and retries after reconnection", async () => {
  const f = fixture();
  try {
    await connect(f);
    f.store.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES('user_profile',?)")
      .run(
        JSON.stringify({
          name: "Jean",
          photo: null,
          email: "private@example.test",
        }),
      );
    f.remote.failProfile = true;
    await f.c.items("GET", "/api/admin/items");
    assert.equal(f.profileCalls.length, 1);
    assert.equal(Object.hasOwn(f.profileCalls[0], "email"), false);
    f.remote.failProfile = false;
    await f.c.items("GET", "/api/admin/items");
    await f.c.items("GET", "/api/admin/items");
    assert.equal(f.profileCalls.length, 2);
    assert.equal(f.profileCalls[1].p_name, "Jean");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Logging out retains shared workspace and roadmap while marking it offline", async () => {
  const f = fixture();
  try {
    await connect(f);
    const state = await f.c.settings("logout");
    assert.equal(state.signedIn, false);
    assert.equal(state.connected, false);
    assert.equal(state.workspace.id, "w");
    assert.equal(f.store.list().length, 1);
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});

test("Presence shares safe context and follows the recently used window", async () => {
  const f = fixture();
  try {
    await connect(f);
    const now = Date.now();
    await f.c.settings("presence", {
      clientId: "first",
      activity: "gantt",
      interactedAt: now - 1000,
      body: "Private note",
    });
    await f.c.settings("presence", {
      clientId: "second",
      activity: "notes",
      interactedAt: now,
    });
    await f.c.settings("presence", {
      clientId: "first",
      activity: "gantt",
      interactedAt: now - 1000,
    });
    assert.equal(f.remote.lastPresence.activity, "notes");
    assert.equal(f.c.state().presenceActivity.user, "notes");
    assert.deepEqual(Object.keys(f.remote.lastPresence).sort(), [
      "activity",
      "editing",
      "interactedAt",
      "itemId",
      "online",
      "updatedAt",
    ]);
    await f.c.settings("presence", {
      clientId: "second",
      activity: "idle",
      interactedAt: now,
    });
    assert.equal(f.remote.lastPresence.activity, "gantt");
    assert.equal(f.store.list()[0].title, "Feature");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Shared grouped rescheduling and undo are atomic and reject stale revisions", async () => {
  const f = fixture();
  try {
    await connect(f);
    const before = f.store.list()[0];
    const result = await f.c.items("POST", "/api/admin/items/reschedule", {
      _revision: 0,
      changes: [
        {
          id: f.id,
          patch: {
            start_date: "2026-11-01",
            end_date: "2026-11-10",
            date_kind: "committed",
          },
        },
      ],
      _change_reason: "Report validé",
    });
    assert.equal(result.status, 200);
    assert.equal(f.remote.items[0].date_kind, "committed");
    assert.equal(f.store.list()[0].start_date, "2026-11-01");
    const h = f.store.history.list(f.id)[0];
    assert.equal(h.reason, "Report validé");
    const changes = f.store.history.undo(h.id, f.store.list());
    f.remote.revision++;
    const stale = await f.c.items("POST", "/api/admin/items/undo", {
      _revision: 1,
      changes,
      undo_of: h.id,
    });
    assert.equal(stale.status, 409);
    assert.equal(f.store.list()[0].start_date, "2026-11-01");
    const fresh = await f.c.items("GET", "/api/admin/items");
    const restored = await f.c.items("POST", "/api/admin/items/undo", {
      _revision: fresh.data[0]._revision,
      changes,
      undo_of: h.id,
    });
    assert.equal(restored.status, 200);
    assert.equal(f.store.list()[0].start_date, before.start_date);
    assert.equal(f.store.list()[0].date_kind, before.date_kind);
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});

test("Joined members receive the shared workspace logo and description", async () => {
  const f = fixture("editor");
  f.remote.identity = {
    description: "Shared product",
    image: "data:image/png;base64,logo",
    identity_configured: true,
  };
  await connect(f);
  const product = JSON.parse(
    f.store.db.prepare("SELECT value FROM metadata WHERE key='product'").get()
      .value,
  );
  assert.equal(product.image, f.remote.identity.image);
  assert.equal(product.description, "Shared product");
  await f.c.close();
  f.store.db.close();
});
test("Team lists accepted members even before their profile exists or while profile sync fails", async () => {
  const f = fixture();
  await connect(f);
  f.remote.members = [
    {
      user_id: "other",
      name: "Membre de l’équipe",
      role: "editor",
      photo: null,
    },
  ];
  f.store.db
    .prepare("INSERT OR REPLACE INTO metadata VALUES('user_profile',?)")
    .run(JSON.stringify({ name: "New identity" }));
  f.remote.failProfile = true;
  const team = await f.c.team();
  assert.deepEqual(team.profiles, f.remote.members);
  assert.ok(team.warning);
  await f.c.close();
  f.store.db.close();
});

test("Logging back in restores the workspace presence subscription without joining again", async () => {
  const f = fixture();
  await connect(f);
  const before = f.remote.subscriptions;
  await f.c.settings("logout");
  await f.c.settings("login", {
    email: "team@example.test",
    password: "password123",
  });
  assert.equal(f.remote.subscriptions, before + 1);
  assert.equal(f.c.state().presenceStatus, "online");
  await f.c.close();
  f.store.db.close();
});

test("A lost realtime channel clears stale avatars and recovers after an HTTP pull", async (t) => {
  const f = fixture();
  await connect(f);
  f.remote.peers = {
    user: [{ activity: "gantt", updatedAt: Date.now() }],
    colleague: [{ activity: "notes", updatedAt: Date.now() }],
  };
  f.remote.syncPresence();
  assert.equal(f.c.state().presence.length, 2);
  const oldCallback = f.remote.channelCallback;
  oldCallback("CHANNEL_ERROR");
  assert.deepEqual(f.c.state().presence, []);
  assert.equal(f.c.state().presenceStatus, "reconnecting");
  await f.c.items("GET", "/api/admin/items");
  assert.equal(f.c.state().presenceStatus, "reconnecting");
  assert.match(f.c.state().error, /Présence interrompue/);
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 16000);
  await f.c.items("GET", "/api/admin/items");
  assert.equal(f.c.state().presenceStatus, "online");
  oldCallback("CLOSED");
  assert.equal(f.c.state().presenceStatus, "online");
  await f.c.close();
  f.store.db.close();
});

test("shared feature creation uses atomic demand conversion and rejects a stale demand without adding an item", async () => {
  const f = fixture();
  await connect(f);
  const body = {
    ...item,
    _revision: 0,
    _demand_id: "request",
    _demand_revision: 3,
  };
  const result = await f.c.items("POST", "/api/admin/items", body);
  assert.equal(result.status, 201);
  assert.equal(f.remote.lastConversion.p_demand, "request");
  assert.equal(f.remote.lastConversion.p_demand_revision, 3);
  assert.equal(f.remote.lastConversion.p_item, result.data.id);
  assert.equal(f.store.list().length, 2);
  f.remote.conversionConflict = true;
  const rejected = await f.c.items("POST", "/api/admin/items", {
    ...body,
    _revision: 1,
  });
  assert.equal(rejected.status, 409);
  assert.equal(f.store.list().length, 2);
  assert.equal(f.remote.items.length, 2);
  f.store.db.close();
});
