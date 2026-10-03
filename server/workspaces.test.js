import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "./store.js";
import { createWorkspaces } from "./workspaces.js";
import {
  inWorkspace,
  beginProgress,
  activity,
  progressFor,
} from "./ai-progress.js";

test("Existing roadmap is preserved; independent workspaces persist and reject invalid paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-spaces-")),
    file = join(dir, "beam.sqlite"),
    root = createStore(file),
    spaces = createWorkspaces(root, file);
  const original = root.save({
    title: "Existing PULS",
    description: "",
    priority: "medium",
    status: "planned",
    visibility: "private",
    category: "Éditeur",
    quarter: "T4 2026",
  });
  const second = spaces.create({
    name: " Product B ",
    description: "New subject",
  }).active;
  assert.notEqual(second, "default");
  assert.equal(spaces.store(second).list().length, 0);
  assert.equal(spaces.list().workspaces[1].name, "Product B");
  assert.equal(root.list()[0].id, original);
  assert.throws(() => spaces.select("../../secrets"), /introuvable/);
  assert.throws(() => spaces.create({ name: " " }), /nom/);
  assert.equal(spaces.active(), second);
  const reopen = createStore(file),
    restored = createWorkspaces(reopen, file);
  assert.equal(restored.active(), second);
  assert.equal(restored.list().workspaces.length, 2);
  restored.store(second).db.close();
  reopen.db.close();
  spaces.store(second).db.close();
  root.db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("Concurrent analysis progress belongs only to its workspace, even with identical job IDs", async () => {
  await Promise.all(
    ["space-a", "space-b"].map((id) =>
      inWorkspace(id, async () => {
        const progress = beginProgress("same-topics", "topics");
        await Promise.resolve();
        progress.update("Analyse", 1, true);
        assert.equal(activity().length, 1);
        assert.equal(activity()[0].workspaceId, id);
        assert.equal(activity()[0].id, "same-topics");
        assert.equal(progressFor("same-topics").workspaceId, id);
        progress.finish();
      }),
    ),
  );
});
