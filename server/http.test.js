import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("production API: authentication, private visibility, suggestions, persistence and voting", async () => {
  const directory = mkdtempSync(join(tmpdir(), "beam-test-"));
  const server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      BEAM_ADMIN_TOKEN: "test-only-key",
      BEAM_DB: join(directory, "test.sqlite"),
      PORT: "5184",
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) => reject(Error("Server exited " + code)));
    });
    const request = (path, method = "GET", body, admin = false, headers = {}) =>
      fetch("http://127.0.0.1:5184/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(admin ? { Authorization: "Bearer test-only-key" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal((await request("admin/items")).status, 401);
    for (const endpoint of [
      "sources",
      "signals",
      "sync-runs",
      "product",
      "notes",
      "ai/status",
      "ai/reviews",
    ])
      assert.equal((await request("admin/" + endpoint)).status, 401);
    assert.equal((await request("public/signals")).status, 404);
    assert.equal((await request("public/notes")).status, 404);
    assert.equal((await request("public/ai/reviews")).status, 404);
    assert.equal(
      (await request("admin/ai/settings", "PATCH", { enabled: true })).status,
      401,
    );
    assert.equal(
      (await request("admin/ai/analyze", "POST", { scope: "note", id: "test" }))
        .status,
      401,
    );
    assert.equal(
      (await request("admin/notes", "POST", { text: "Privé" })).status,
      401,
    );
    const noteResponse = await request(
      "admin/notes",
      "POST",
      { text: "Relancer Sarah demain" },
      true,
    );
    assert.equal(noteResponse.status, 201);
    const note = await noteResponse.json();
    assert.equal(note.kind, "followup");
    assert.equal(
      (
        await request(
          "admin/notes/" + note.id,
          "PATCH",
          { state: "done" },
          true,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await request("admin/notes", "GET", undefined, true)).json())[0]
        .state,
      "done",
    );
    assert.deepEqual(await (await request("public/product")).json(), {
      name: "PULS",
    });
    assert.equal(
      (
        await request(
          "admin/product",
          "PATCH",
          { name: "Another product", secret: "never publish" },
          true,
        )
      ).status,
      200,
    );
    assert.deepEqual(await (await request("public/product")).json(), {
      name: "Another product",
    });
    let res = await request("public/items");
    assert.deepEqual(await res.json(), []);
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const item = {
      title: "Test persisted feature",
      description: "Test",
      category: "Éditeur",
      priority: "high",
      status: "planned",
      visibility: "private",
      quarter: "T1 2027",
    };
    res = await request("admin/items", "POST", item, true);
    assert.equal(res.status, 201);
    const { id } = await res.json();
    assert.equal((await (await request("public/items")).json()).length, 0);
    assert.equal(
      (await request(`public/items/${id}/vote`, "POST", {})).status,
      400,
    );
    assert.equal(
      (
        await request(
          "admin/items/" + id,
          "PATCH",
          { visibility: "public" },
          true,
        )
      ).status,
      200,
    );
    res = await request(`public/items/${id}/vote`, "POST", {}, false, {
      Cookie: cookie,
    });
    assert.equal(res.status, 200);
    let rows = await (
      await request("public/items", "GET", null, false, { Cookie: cookie })
    ).json();
    assert.equal(rows[0].votes, 1);
    assert.equal(rows[0].voted, 1);
    assert.equal(
      (
        await request("public/suggestions", "POST", {
          title: "A suggestion",
          description: "Context",
        })
      ).status,
      201,
    );
    assert.equal(
      (await (await request("admin/suggestions", "GET", null, true)).json())
        .length,
      1,
    );
    assert.equal(
      (
        await request("admin/items", "POST", item, true, {
          Origin: "https://untrusted.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("admin/items/" + id, "DELETE", {}, true)).status,
      200,
    );
    assert.equal((await (await request("public/items")).json()).length, 0);
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
