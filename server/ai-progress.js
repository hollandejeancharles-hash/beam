import { AsyncLocalStorage } from "node:async_hooks";
const workspaceContext = new AsyncLocalStorage();
export const inWorkspace = (id, fn) => workspaceContext.run(id, fn);
const scopedId = (id) =>
  workspaceContext.getStore() ? workspaceContext.getStore() + ":" + id : id;
const jobs = new Map();
const labels = {
  demand: "Analyse de la demande",
  publication: "Rédaction de la publication",
  note: "Organisation de la note",
  feature: "Analyse de l’élément",
  associations: "Rapprochement des sources",
  topics: "Regroupement des sujets",
  brief: "Préparation du brief produit",
};
export function beginProgress(id, scope, entities = {}) {
  const displayId = id;
  id = scopedId(id);
  const workspaceId = workspaceContext.getStore();
  const started = Date.now();
  jobs.set(id, {
    id: displayId,
    scope,
    workspaceId,
    label: labels[scope],
    state: "queued",
    phase: "En attente",
    completed: 0,
    total: 4,
    indeterminate: true,
    received: 0,
    started,
    ...entities,
  });
  return {
    update(phase, completed, indeterminate = false) {
      const job = jobs.get(id);
      if (job)
        Object.assign(job, {
          state: "running",
          phase,
          completed,
          indeterminate,
        });
    },
    received(count) {
      const job = jobs.get(id);
      if (job) job.received = count;
    },
    finish(error) {
      const job = jobs.get(id);
      if (job)
        Object.assign(job, {
          state: error ? "error" : "complete",
          phase: error ? "Analyse interrompue" : "Analyse terminée",
          completed: error ? job.completed : job.total,
          indeterminate: false,
          error: error || null,
          finished: Date.now(),
        });
    },
  };
}
export function progressFor(id) {
  return jobs.get(scopedId(id)) || null;
}
export function activity() {
  const now = Date.now();
  for (const [id, job] of jobs)
    if (job.finished && now - job.finished > 60000) jobs.delete(id);
  return [...jobs.values()]
    .filter(
      (job) =>
        !workspaceContext.getStore() ||
        job.workspaceId === workspaceContext.getStore(),
    )
    .map((job) => ({
      ...job,
      elapsed: Math.floor(((job.finished || now) - job.started) / 1000),
    }));
}

// Ollama exposes streaming output, but no total generation length or percentage.
// Track only bytes actually received and explicit completed server stages.
export async function readModelResponse(response, progress) {
  if (!response.body?.getReader) return response.json();
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    content = "",
    thinking = "",
    final = null,
    received = 0;
  function consume(line) {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw Error("Le modèle local a interrompu l’analyse.");
    content += chunk.message?.content || "";
    thinking += chunk.message?.thinking || "";
    received = content.length + thinking.length;
    progress?.received(received);
    if (chunk.done) final = chunk;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, index));
        pending = pending.slice(index + 1);
      }
      if (received > 1000000) throw Error("Réponse locale trop volumineuse.");
    }
    pending += decoder.decode();
    consume(pending);
    if (!final) throw Error("La réponse locale a été interrompue.");
    return { ...final, message: { ...final.message, content } };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
