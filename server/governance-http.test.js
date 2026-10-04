import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Authenticated impact, apply and undo API preserves workspace data and stale plans", async () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-governance-http-"));
  const server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      BEAM_ADMIN_TOKEN: "governance-test-key",
      BEAM_DB: join(dir, "test.sqlite"),
      PORT: "5197",
      BEAM_OLLAMA_AUTOSTART: "0",
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) => reject(Error("Server exited " + code)));
    });
    const call = async (path, method = "GET", body, auth = true) => {
      const r = await fetch("http://127.0.0.1:5197/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer governance-test-key" } : {}),
          "X-Beam-Workspace": "default",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    for (const path of [
      "admin/contradictions",
      "admin/items/00000000-0000-0000-0000-000000000000/history",
    ])
      assert.equal((await call(path, "GET", null, false)).status, 401);
    const created = await call("admin/items", "POST", {
      title: "Zoom test",
      description: "Test",
      category: "Éditeur",
      priority: "medium",
      status: "planned",
      visibility: "private",
      quarter: "T4 2026",
      start_date: "2026-10-01",
      end_date: "2026-10-10",
    });
    assert.equal(created.status, 201);
    const id = created.data.id;
    const patch = { start_date: "2026-11-01", end_date: "2026-11-10" };
    const preview = await call("admin/planning/preview", "POST", { id, patch });
    assert.equal(preview.status, 200);
    await call("admin/items/" + id, "PATCH", { priority: "high" });
    assert.equal(
      (
        await call("admin/planning/apply", "POST", {
          id,
          patch,
          token: preview.data.token,
        })
      ).status,
      400,
    );
    const fresh = await call("admin/planning/preview", "POST", { id, patch });
    assert.equal(
      (
        await call("admin/planning/apply", "POST", {
          id,
          patch,
          token: fresh.data.token,
          reason: "Arbitrage de test",
        })
      ).status,
      200,
    );
    const history = await call(`admin/items/${id}/history`);
    assert.equal(history.status, 200);
    assert.equal(history.data[0].reason, "Arbitrage de test");
    assert.equal(history.data[0].can_undo, true);
    assert.equal(
      (
        await call("admin/history/undo", "POST", {
          history_id: history.data[0].id,
        })
      ).status,
      200,
    );
    const items = (await call("admin/items")).data;
    assert.equal(items[0].start_date, "2026-10-01");
    assert.equal(items[0].priority, "high");
    assert.equal((await call("admin/inbox")).status, 200);
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
