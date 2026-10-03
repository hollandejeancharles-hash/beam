import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Workspace API isolates roadmap, notes, sources and public links; stale writes are rejected", async () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-spaces-api-"));
  const server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      BEAM_DESKTOP: "1",
      BEAM_ADMIN_TOKEN: "spaces-test",
      BEAM_DB: join(dir, "beam.sqlite"),
      PORT: "5194",
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) => reject(Error("Exit " + code)));
    });
    const call = async (path, method = "GET", body, id) => {
      const response = await fetch("http://127.0.0.1:5194/api/" + path, {
        method,
        headers: {
          Authorization: "Bearer spaces-test",
          "Content-Type": "application/json",
          ...(id ? { "X-Beam-Workspace": id } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    };
    await call("admin/ai/settings", "PATCH", { enabled: false });
    const original = (
      await call("admin/items", "POST", {
        title: "PULS original",
        description: "",
        category: "Éditeur",
        status: "planned",
        priority: "medium",
        visibility: "public",
        quarter: "T4 2026",
      })
    ).data;
    await call("admin/notes", "POST", { text: "Private PULS note" });
    await call("admin/profile", "PATCH", { name: "One person" });
    const state = (
      await call(
        "admin/workspaces",
        "POST",
        { name: "Autre produit" },
        "default",
      )
    ).data;
    const second = state.active;
    assert.notEqual(second, "default");
    assert.equal(
      (await call("admin/notes", "POST", { text: "Missing workspace" })).status,
      409,
    );
    assert.deepEqual((await call("admin/items")).data, []);
    assert.deepEqual((await call("admin/notes")).data, []);
    assert.deepEqual((await call("admin/sources")).data, []);
    assert.equal((await call("admin/profile")).data.name, "One person");
    assert.equal(
      (await call("admin/items", "POST", { title: "Stale tab" }, "default"))
        .status,
      409,
    );
    assert.equal(
      (await call("public/items?workspace=default")).data[0].id,
      original.id,
    );
    assert.deepEqual((await call("public/items?workspace=" + second)).data, []);
    assert.equal(
      (
        await call(
          "admin/workspaces/select",
          "POST",
          { id: "../../etc" },
          second,
        )
      ).status,
      404,
    );
    await call("admin/workspaces/select", "POST", { id: "default" }, second);
    assert.equal((await call("admin/items")).data[0].title, "PULS original");
    assert.equal((await call("admin/notes")).data[0].text, "Private PULS note");
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
