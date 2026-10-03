import { totalmem } from "node:os";
import { AI_MODEL } from "./ai.js";
export function createAISetup(fetcher = fetch) {
  let state = { state: "idle", completed: 0, total: 0, message: "" };
  const layers = new Map();
  async function status() {
    let installed = false,
      available = false;
    try {
      const r = await fetcher("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(1200),
      });
      const d = await r.json();
      available = r.ok;
      installed = !!d.models?.some((m) => m.name === AI_MODEL);
    } catch {}
    return {
      ...state,
      available,
      installed,
      model: AI_MODEL,
      memoryGB: Math.round(totalmem() / 1024 ** 3),
    };
  }
  async function download() {
    try {
      const response = await fetcher("http://127.0.0.1:11434/api/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL, stream: true }),
      });
      if (!response.ok)
        throw Error("Le moteur IA ne peut pas télécharger le modèle.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      const update = (line) => {
        if (!line.trim()) return;
        const row = JSON.parse(line);
        if (row.error) throw Error(row.error);
        if (row.digest && row.total) {
          layers.set(row.digest, {
            total: row.total,
            completed: row.completed || 0,
          });
          state.total = [...layers.values()].reduce((n, v) => n + v.total, 0);
          state.completed = [...layers.values()].reduce(
            (n, v) => n + v.completed,
            0,
          );
        }
        state.message = row.status || "Téléchargement";
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) update(line);
        if (buffer.length > 100000) throw Error("Réponse du moteur invalide");
      }
      if (buffer.trim()) update(buffer);
      if (!(await status()).installed)
        throw Error("Le modèle téléchargé n’est pas encore disponible.");
      state.state = "ready";
      state.message = "Assistant prêt sur ce Mac";
    } catch (e) {
      state.state = "error";
      state.message = e.message;
    }
  }
  return {
    status,
    async install() {
      const current = await status();
      if (current.installed) return current;
      if (state.state === "downloading") return current;
      if (!current.available)
        throw Error("Le moteur IA local n’est pas disponible.");
      layers.clear();
      state = {
        state: "downloading",
        completed: 0,
        total: 0,
        message: "Préparation du téléchargement",
      };
      void download();
      return status();
    },
  };
}
