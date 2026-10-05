import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {createHash} from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Workspace API isolates roadmap, sources and public links while sharing the personal notebook; pinned windows can write independently", async () => {
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
    assert.equal((await call("admin/notes")).data.length, 1);
    assert.deepEqual((await call("admin/notes")).data[0].workspace_ids, []);
    assert.deepEqual((await call("admin/sources")).data, []);
    assert.equal((await call("admin/profile")).data.name, "One person");
    const personal = (await call("admin/notes", "POST", {text:"Une tâche pour le second workspace",workspace_ids:[second]},"default")).data;
    const task = await call("admin/items","POST",{type:"task",title:"Tâche issue du carnet commun",description:personal.text,category:"Éditeur",status:"planned",priority:"medium",visibility:"private",quarter:"T4 2026",_source_note_id:personal.id},second);
    assert.equal(task.status,201,JSON.stringify(task.data));
    assert.equal((await call("admin/items","GET",undefined,second)).data[0].id,task.data.id);
    assert.equal((await call("admin/items","GET",undefined,"default")).data.length,1);
    const globalNote=(await call("admin/notes","GET",undefined,"default")).data.find(n=>n.id===personal.id);
    assert.ok(globalNote.references.some(r=>r.workspace_id===second&&r.item_id===task.data.id));
    const demand=await call("admin/demands","POST",{title:"Demande contextualisée",description:personal.text,note_id:personal.id,note_hash:createHash('sha256').update(personal.text).digest('hex'),excerpt:personal.text,suggested_item_id:task.data.id},second);
    assert.equal(demand.status,201,JSON.stringify(demand.data));
    assert.equal(demand.data.data.state,'review');
    assert.equal(demand.data.data.suggested_item_id,task.data.id);
    const globalSubjects=await call("admin/notebook/topics","GET",undefined,second);
    assert.equal(globalSubjects.status,200);
    const beforeJoin = (await call("admin/workspaces")).data.workspaces.length;
    assert.equal(
      (
        await call(
          "admin/collaboration",
          "POST",
          { action: "join", code: "not-a-link" },
          second,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "admin/collaboration",
          "POST",
          { action: "join", code: "ab".repeat(24) },
          second,
        )
      ).status,
      400,
    );
    assert.equal(
      (await call("admin/workspaces")).data.workspaces.length,
      beforeJoin,
    );

    assert.equal(
      (
        await call(
          "admin/notes",
          "POST",
          { text: "Pinned default window" },
          "default",
        )
      ).status,
      201,
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
    assert.equal((await call("admin/notes")).data.length, 3);
    const bundle = (await call("admin/backup/all", "GET", undefined, "default"))
      .data;
    assert.equal(bundle.workspaces.length, 2);
    assert.equal(JSON.stringify(bundle).includes("beam_shared_session"), false);
    assert.equal(
      (await call("admin/backup/preview", "POST", bundle, "default")).data
        .workspaceCount,
      2,
    );
    const restored = await call(
      "admin/backup/restore",
      "POST",
      bundle,
      "default",
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    assert.equal((await call("admin/workspaces")).data.workspaces.length, 4);
    assert.equal(
      (await call("admin/items", "GET", undefined, "default")).data[0].id,
      original.id,
    );
    const exported = (
      await call("admin/public-export", "GET", undefined, "default")
    ).data;
    assert.equal(exported.roadmap.length, 1);
    assert.equal(Object.hasOwn(exported, "notes"), false);
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
