import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export async function replaceApp(
  {
    current,
    staged,
    previous,
    data,
    recovery,
    pid,
    serverPid,
    rollback = false,
  },
  deps = {},
) {
  const alive =
    deps.alive ||
    ((p) => {
      try {
        process.kill(p, 0);
        return true;
      } catch {
        return false;
      }
    });
  const open = deps.open || ((path) => execFileSync("/usr/bin/open", [path]));
  for (let n = 0; n < 300 && [pid, serverPid].filter(Boolean).some(alive); n++)
    await delay(100);
  if ([pid, serverPid].filter(Boolean).some(alive))
    throw Error("Beam ne s’est pas fermé ; installation annulée.");
  if (
    resolve(current) === resolve(staged) ||
    dirname(current) !== dirname(previous)
  )
    throw Error("Chemins de mise à jour invalides.");
  if (!existsSync(staged)) throw Error("Nouvelle version absente.");
  mkdirSync(recovery, { recursive: true, mode: 0o700 });
  if (existsSync(data))
    cpSync(data, join(recovery, "data"), {
      recursive: true,
      filter: (source) => source !== join(data, "ai"),
    });
  const old = rollback
    ? join(dirname(current), ".Beam-returned-" + Date.now() + ".app")
    : previous;
  if (!rollback && existsSync(previous))
    renameSync(
      previous,
      join(dirname(current), ".Beam-older-" + Date.now() + ".app"),
    );
  renameSync(current, old);
  try {
    renameSync(staged, current);
  } catch (e) {
    renameSync(old, current);
    throw e;
  }
  writeFileSync(
    join(recovery, "result.json"),
    JSON.stringify({
      installed: true,
      rollback,
      previous: old,
      date: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  try {
    open(current);
  } catch (e) {
    throw Error(
      "Version installée. Ouvrez Beam depuis Applications. " + e.message,
    );
  }
}
if (
  process.argv[2] &&
  import.meta.url ===
    (await import("node:url")).pathToFileURL(process.argv[1]).href
) {
  const { readFileSync } = await import("node:fs");
  const plan = JSON.parse(readFileSync(process.argv[2]));
  try {
    await replaceApp(plan);
  } catch (e) {
    try {
      mkdirSync(dirname(plan.recovery), { recursive: true, mode: 0o700 });
      writeFileSync(join(dirname(plan.recovery), "last-error.txt"), e.message, {
        mode: 0o600,
      });
    } catch {}
    writeFileSync(join(dirname(process.argv[2]), "error.txt"), e.message, {
      mode: 0o600,
    });
    try {
      execFileSync("/usr/bin/open", [plan.current]);
    } catch {}
    process.exitCode = 1;
  }
}
