import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import React, { createContext, useContext, useRef, useState } from "react";
const ActivityContext = createContext([]);
export function AIActivityProvider({ api, enabled, children, className }) {
  const [jobs, setJobs] = useState([]),
    apiRef = useRef(api);
  apiRef.current = api;
  useVisiblePolling(
    async () => {
      if (!enabled) {
        setJobs((previous) => (previous.length ? [] : previous));
        return;
      }
      try {
        const next = await apiRef.current("admin/ai/activity");
        setJobs((previous) => unchangedData(previous, next));
      } catch {
        setJobs((previous) => (previous.length ? [] : previous));
      }
    },
    jobs.some((j) => ["queued", "running"].includes(j.state)) ? 1500 : 6000,
    [enabled],
  );
  return (
    <ActivityContext.Provider value={jobs}>
      <div className={className}>{children}</div>
    </ActivityContext.Provider>
  );
}
export function useAIActivity() {
  return useContext(ActivityContext);
}
export default function AIProgress({
  noteId,
  itemId,
  sourceId,
  scope,
  jobId,
  fallback,
  showLabel = false,
  size = 20,
}) {
  const jobs = useAIActivity();
  const job =
    [...jobs]
      .sort(
        (a, b) =>
          (a.state === "running" ? 0 : 1) - (b.state === "running" ? 0 : 1),
      )
      .find(
        (j) =>
          ["queued", "running"].includes(j.state) &&
          (!scope || j.scope === scope) &&
          (!jobId || j.id === jobId || j.original_id === jobId) &&
          (!noteId ||
            j.notes?.includes(noteId) ||
            j.sources?.includes("note:" + noteId)) &&
          (!itemId || j.items?.includes(itemId)) &&
          (!sourceId || j.sources?.includes(sourceId)),
      ) || fallback;
  if (!job || !["queued", "running"].includes(job.state)) return null;
  const live = jobs.find((j) => j.id === job.id);
  if (live && !["queued", "running"].includes(live.state)) return null;
  const phase =
      job.phase || (job.state === "queued" ? "En attente" : "Analyse locale"),
    total = job.total || 4,
    completed = job.completed || 0;
  const text = `${job.label || "Assistant local"} · ${phase} · ${completed}/${total} étapes terminées${job.elapsed ? ` · ${job.elapsed} s` : ""}${job.units ? ` · lot de ${job.units} sources` : ""}${job.received ? ` · ${job.received} caractères reçus` : ""}`;
  return (
    <span className="ai-progress" title={text} data-phase={phase}>
      <span
        className="ai-spinner"
        role="progressbar"
        aria-label={text}
        aria-valuetext={phase}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <circle
            className="ai-spinner-track"
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeWidth="2"
          />
          <circle
            className="ai-spinner-arc"
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="40 17"
          />
        </svg>
      </span>
      {showLabel && (
        <span className="ai-progress-label">
          {phase}
          {job.elapsed > 0 && <small>{job.elapsed} s écoulées</small>}
        </span>
      )}
    </span>
  );
}
