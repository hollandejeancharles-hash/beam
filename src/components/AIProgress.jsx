import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressTrack,
  CircularProgressRange,
} from "./ui/circular-progress";
const ActivityContext = createContext([]);
export function AIActivityProvider({ api, enabled, children, className }) {
  const [jobs, setJobs] = useState([]),
    apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    if (!enabled) {
      setJobs([]);
      return;
    }
    let alive = true,
      timer;
    async function refresh() {
      try {
        const next = await apiRef.current("admin/ai/activity");
        if (alive) setJobs(next);
      } catch {
        if (alive) setJobs([]);
      } finally {
        if (alive) timer = setTimeout(refresh, 1000);
      }
    }
    refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [enabled]);
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
          (!jobId || j.id === jobId) &&
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
      <CircularProgress
        value={job.state === "queued" ? null : completed}
        max={total}
        size={size}
        thickness={2}
        label={text}
        getValueText={() => text}
        aria-valuetext={text}
      >
        <CircularProgressIndicator>
          <CircularProgressTrack />
          <CircularProgressRange />
          {job.indeterminate && job.state !== "queued" && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={(size - 2) / 2}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 7"
              className="ai-progress-pending"
            />
          )}
        </CircularProgressIndicator>
      </CircularProgress>
      {showLabel && (
        <span className="ai-progress-label">
          {phase}
          <small>
            {completed}/{total} étapes{job.elapsed ? ` · ${job.elapsed} s` : ""}
          </small>
        </span>
      )}
    </span>
  );
}
