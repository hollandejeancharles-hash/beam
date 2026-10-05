import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "./store.js";
import {
  planningRange,
  progressValue,
  hierarchyRows,
  isDate,
  dateValue,
} from "../shared/planning.js";
import { publicRoadmap } from "../scripts/public-roadmap.js";
const entry = {
  title: "Feature",
  description: "Description",
  category: "Éditeur",
  priority: "high",
  status: "planned",
  visibility: "public",
  quarter: "T4 2026",
};
test("legacy databases migrate without inventing precise dates or losing records", () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-migration-")),
    path = join(dir, "db.sqlite");
  try {
    const db = new DatabaseSync(path);
    db.exec(
      "CREATE TABLE items(id TEXT PRIMARY KEY,title TEXT,description TEXT,category TEXT,priority TEXT,status TEXT,visibility TEXT,quarter TEXT,created TEXT)",
    );
    db.prepare("INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?)").run(
      "old",
      entry.title,
      entry.description,
      entry.category,
      entry.priority,
      entry.status,
      entry.visibility,
      entry.quarter,
      "2026-10-01",
    );
    db.close();
    const s = createStore(path);
    assert.equal(s.list()[0].type, "feature");
    assert.equal(s.list()[0].start_date, null);
    s.save(
      {
        owner: "Équipe produit",
        start_date: "2026-10-05",
        end_date: "2026-11-01",
        progress: 25,
      },
      "old",
    );
    s.db.close();
    const reopened = createStore(path);
    assert.equal(reopened.list()[0].progress, 25);
    assert.equal(reopened.list()[0].owner, "Équipe produit");
    reopened.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("planning rejects partial, reversed and impossible dates and invalid progress", () => {
  const s = createStore(":memory:");
  for (const bad of [
    { start_date: "2026-10-01" },
    { start_date: "2026-11-01", end_date: "2026-10-01" },
    { start_date: "2026-02-31", end_date: "2026-03-02" },
    { progress: 101 },
    { progress: 1.5 },
  ])
    assert.throws(() => s.save({ ...entry, ...bad }));
  assert.equal(isDate("2028-02-29"), true);
  s.db.close();
});
test("initiative-project-feature hierarchy validates parent types and safe deletion", () => {
  const s = createStore(":memory:");
  const initiative = s.save({ ...entry, type: "initiative" }),
    project = s.save({ ...entry, type: "project", parent_id: initiative }),
    feature = s.save({ ...entry, parent_id: project });
  assert.throws(() =>
    s.save({ ...entry, type: "initiative", parent_id: project }),
  );
  assert.throws(() => s.save({ type: "feature" }, project));
  s.remove(project);
  assert.equal(s.list().find((i) => i.id === feature).parent_id, null);
  s.db.close();
});
test("dependencies reject cycles and references to private items are stripped publicly", () => {
  const s = createStore(":memory:");
  const a = s.save({ ...entry, visibility: "private" }),
    b = s.save({ ...entry, dependency_id: a });
  assert.throws(() => s.save({ dependency_id: b }, a));
  assert.equal(s.list(true)[0].dependency_id, null);
  assert.equal(publicRoadmap(s.list())[0].dependency_id, null);
  s.remove(a);
  assert.equal(s.list()[0].dependency_id, null);
  s.db.close();
});
test("Gantt distinguishes quarter estimates, real dates and parent rollups", () => {
  const root = { id: "i", type: "initiative" },
    project = { id: "p", type: "project", parent_id: "i" },
    one = {
      id: "a",
      parent_id: "p",
      start_date: "2026-10-05",
      end_date: "2026-10-20",
      progress: 50,
      status: "progress",
    },
    two = {
      id: "b",
      parent_id: "p",
      start_date: "2026-10-10",
      end_date: "2026-11-05",
      status: "done",
    };
  const items = [root, project, one, two];
  assert.equal(progressValue(root, items), 75);
  const range = planningRange(root, items);
  assert.equal(range.start, dateValue("2026-10-05"));
  assert.equal(range.end, dateValue("2026-11-05"));
  assert.equal(range.estimated, false);
  assert.equal(planningRange({ quarter: "T4 2026" }, []).estimated, true);
  assert.equal(hierarchyRows(items, new Set(["p"])).length, 2);
  assert.equal(hierarchyRows(items)[3].depth, 2);
});

test("features may sit directly under initiatives with optional project level", () => {
  const s = createStore(":memory:");
  const root = s.save({ ...entry, type: "initiative" });
  const child = s.save({ ...entry, type: "feature", parent_id: root });
  assert.equal(
    hierarchyRows(s.list()).find((r) => r.item.id === child).depth,
    1,
  );
  const project = s.save({ ...entry, type: "project", parent_id: root });
  s.save({ parent_id: project }, child);
  assert.equal(
    hierarchyRows(s.list()).find((r) => r.item.id === child).depth,
    2,
  );
  assert.equal(hierarchyRows(s.list(), new Set([root])).length, 1);
  s.db.close();
});

test("tasks belong to initiatives, projects or features and participate in hierarchy and progress", () => {
  const s = createStore(":memory:");
  const initiative = s.save({ ...entry, type: "initiative" });
  const project = s.save({ ...entry, type: "project", parent_id: initiative });
  const task = s.save({ ...entry, type: "task", parent_id: project, status: "done" });
  assert.equal(s.list().find(i => i.id === task).type, "task");
  assert.equal(hierarchyRows(s.list()).find(r => r.item.id === task).depth, 2);
  assert.equal(progressValue(s.list().find(i => i.id === project), s.list()), 100);
  const feature = s.save({ ...entry, type: "feature", parent_id: initiative });
  const initiativeTask = s.save({ ...entry, type: "task", parent_id: initiative });
  const featureTask = s.save({ ...entry, type: "task", parent_id: feature });
  assert.equal(s.list().find(i => i.id === initiativeTask).parent_id, initiative);
  assert.equal(s.list().find(i => i.id === featureTask).parent_id, feature);
  assert.throws(() => s.save({type:"task",parent_id:featureTask}, feature));
  assert.throws(() => s.save({ ...entry, type: "task", parent_id: task }));
  s.remove(project);
  assert.equal(s.list().find(i => i.id === task).parent_id, null);
  s.db.close();
});
