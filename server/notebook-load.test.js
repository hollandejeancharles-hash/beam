import test from "node:test";
import assert from "node:assert/strict";
import { loadNotebook } from "../shared/notebook-load.js";
test("notes render while the assistant is still unavailable", async () => {
  let finish;
  const pending = new Promise((resolve) => (finish = resolve));
  const received = [];
  const loading = loadNotebook(
    (path) => (path === "admin/ai/status" ? pending : Promise.resolve(path)),
    (section) => received.push(section),
    () => {},
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(received.includes("notes"));
  assert.ok(!received.includes("status"));
  finish({ enabled: true });
  await loading;
  assert.ok(received.includes("status"));
});
test("secondary failures preserve the notebook and identify the failed section", async () => {
  const received = [],
    errors = [];
  await loadNotebook(
    async (path) => {
      if (path === "admin/topics") throw Error("offline");
      return [];
    },
    (section) => received.push(section),
    (error, section) => errors.push(section),
  );
  assert.ok(received.includes("notes"));
  assert.ok(received.includes("inbox"));
  assert.deepEqual(errors, ["subjects"]);
});
