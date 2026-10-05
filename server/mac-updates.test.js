import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceApp } from "../scripts/macos/install-update.mjs";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "beam-update-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = {
    current: join(root, "Beam.app"),
    staged: join(root, ".Beam-staged.app"),
    previous: join(root, ".Beam-previous.app"),
    data: join(root, "data"),
    recovery: join(root, "recovery"),
    pid: 0,
    serverPid: 0,
  };
  for (const [path, value] of [
    [plan.current, "old"],
    [plan.staged, "new"],
    [plan.data, "notes"],
  ]) {
    mkdirSync(path);
    writeFileSync(join(path, "value"), value);
  }
  mkdirSync(join(plan.data, "ai"));
  writeFileSync(join(plan.data, "ai", "model"), "big");
  return plan;
}
test("Mac update backs up data, replaces app, keeps previous and does not copy AI models", async (t) => {
  const p = fixture(t);
  let opened;
  await replaceApp(p, { open: (path) => (opened = path) });
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "new");
  assert.equal(readFileSync(join(p.previous, "value"), "utf8"), "old");
  assert.equal(readFileSync(join(p.data, "value"), "utf8"), "notes");
  assert.equal(
    readFileSync(join(p.recovery, "data", "value"), "utf8"),
    "notes",
  );
  assert.equal(existsSync(join(p.recovery, "data", "ai")), false);
  assert.equal(opened, p.current);
});
test("Mac rollback retains notes written after the update", async (t) => {
  const p = fixture(t);
  await replaceApp(p, { open: () => {} });
  writeFileSync(join(p.data, "value"), "new notes");
  await replaceApp(
    {
      ...p,
      staged: p.previous,
      rollback: true,
      recovery: p.recovery + "-rollback",
    },
    { open: () => {} },
  );
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "old");
  assert.equal(readFileSync(join(p.data, "value"), "utf8"), "new notes");
});
test("Missing or invalid staged app does not move current app", async (t) => {
  const p = fixture(t);
  await assert.rejects(
    replaceApp({ ...p, staged: p.staged + "missing" }, { open: () => {} }),
    /absente/,
  );
  await assert.rejects(
    replaceApp({ ...p, staged: p.current }, { open: () => {} }),
    /invalides/,
  );
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "old");
});
test("Failed backup stops installation before replacing the app", async (t) => {
  const p = fixture(t);
  writeFileSync(p.recovery, "blocked");
  await assert.rejects(replaceApp(p, { open: () => {} }));
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "old");
});

test("Failed final replacement restores the original app", async (t) => {
  const p = fixture(t),
    nested = join(p.current, "nested.app");
  mkdirSync(nested);
  await assert.rejects(
    replaceApp({ ...p, staged: nested }, { open: () => {} }),
  );
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "old");
});

test("Mac installer CLI executes through a symlinked temporary path", (t) => {
  const p = fixture(t);
  const root = join(p.recovery, "..");
  const script = join(root, "install-update.mjs");
  writeFileSync(
    script,
    readFileSync(
      new URL("../scripts/macos/install-update.mjs", import.meta.url),
    ),
  );
  const alias = root + "-alias";
  symlinkSync(root, alias);
  t.after(() => rmSync(alias));
  // Wait on this test process: the helper must acknowledge startup before mutation.
  writeFileSync(
    join(root, "plan.json"),
    JSON.stringify({ ...p, pid: process.pid }),
  );
  const child = spawnSync(
    process.execPath,
    [join(alias, "install-update.mjs"), join(root, "plan.json")],
    { timeout: 1000 },
  );
  assert.equal(child.error?.code, "ETIMEDOUT");
  assert.equal(
    JSON.parse(readFileSync(join(root, "started.json"))).started,
    true,
  );
  assert.equal(readFileSync(join(p.current, "value"), "utf8"), "old");
});
