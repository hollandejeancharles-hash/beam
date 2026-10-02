import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createStore, seed } from "./store.js";
const item = {
  title: "Test feature",
  description: "Useful change",
  category: "Éditeur",
  priority: "high",
  status: "planned",
  visibility: "public",
  quarter: "T1 2027",
};
test("private roadmap entries never appear publicly and cannot receive votes", () => {
  const s = createStore(":memory:");
  const id = s.save({ ...item, visibility: "private" });
  assert.equal(s.list().length, 1);
  assert.equal(s.list(true).length, 0);
  assert.throws(() => s.vote(id, "visitor"));
  s.db.close();
});
test("votes toggle independently and updates preserve votes", () => {
  const s = createStore(":memory:");
  const id = s.save(item);
  s.vote(id, "a");
  s.vote(id, "b");
  s.save({ status: "progress" }, id);
  assert.equal(s.list(true, "a")[0].votes, 2);
  assert.equal(s.list(true, "a")[0].voted, 1);
  assert.equal(s.list(true, "c")[0].voted, 0);
  s.vote(id, "a");
  assert.equal(s.list()[0].votes, 1);
  s.remove(id);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM votes").get().n, 0);
  s.db.close();
});
test("reject invalid records and excessively long content", () => {
  const s = createStore(":memory:");
  for (const bad of [
    { title: " " },
    { status: "fake" },
    { visibility: "fake" },
    { priority: "urgent" },
    { description: "a".repeat(5001) },
  ])
    assert.throws(() => s.save({ ...item, ...bad }));
  assert.throws(() => s.suggest("", "test"));
  s.db.close();
});
test("demo seed runs once even after all records are removed", () => {
  const s = createStore(":memory:");
  seed(s);
  assert.equal(s.list().length, 9);
  for (const i of s.list()) s.remove(i.id);
  seed(s);
  assert.equal(s.list().length, 0);
  s.db.close();
});

test("items and votes survive closing and reopening the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-store-"));
  try {
    let s = createStore(join(dir, "test.sqlite"));
    const id = s.save(item);
    s.vote(id, "a");
    s.db.close();
    s = createStore(join(dir, "test.sqlite"));
    assert.equal(s.list()[0].title, item.title);
    assert.equal(s.list()[0].votes, 1);
    s.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
