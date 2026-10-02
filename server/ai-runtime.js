import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
// Optional workspace installation; no download or cloud fallback at runtime.
export async function startLocalAI() {
  const binary = resolve("data/ai/runtime/ollama");
  if (!existsSync(binary)) return;
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(1000),
    });
    if (r.ok) return;
  } catch {}
  mkdirSync("data/ai", { recursive: true });
  const log = openSync("data/ai/ollama.log", "a");
  const child = spawn(binary, ["serve"], {
    env: {
      ...process.env,
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_MODELS: resolve("data/ai/models"),
      OLLAMA_NO_CLOUD: "1",
      OLLAMA_NUM_PARALLEL: "1",
      OLLAMA_MAX_LOADED_MODELS: "1",
    },
    stdio: ["ignore", log, log],
  });
  closeSync(log);
  child.on("error", () => {});
  const stop = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.once("exit", stop);
  process.once("SIGTERM", () => {
    stop();
    process.exit(0);
  });
  process.once("SIGINT", () => {
    stop();
    process.exit(0);
  });
}
