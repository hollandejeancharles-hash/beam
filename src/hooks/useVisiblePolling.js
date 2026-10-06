import { useEffect, useRef } from "react";

// Never overlap slow requests. Hidden windows stop polling and catch up as soon
// as they become visible; actions still refresh immediately through their APIs.
export default function useVisiblePolling(
  task,
  interval,
  dependencies = [],
  event,
) {
  const latest = useRef(task),
    delay = useRef(interval);
  latest.current = task;
  delay.current = interval;
  useEffect(() => {
    let alive = true,
      busy = false,
      timer,
      rerun = false,
      initialized = false;
    async function refresh() {
      clearTimeout(timer);
      // WebKit may still report a newly mounted desktop view as hidden.
      // Always load once; visibility only suspends subsequent refreshes.
      if (!alive || (initialized && document.hidden)) return;
      if (busy) {
        rerun = true;
        return;
      }
      busy = true;
      try {
        await latest.current();
      } catch {
        /* Consumers display their own errors. The next tick can recover. */
      } finally {
        initialized = true;
        busy = false;
        if (alive && !document.hidden) {
          const next = rerun ? 0 : delay.current;
          rerun = false;
          timer = setTimeout(refresh, next);
        }
      }
    }
    function visibility() {
      clearTimeout(timer);
      if (!document.hidden) void refresh();
    }
    void refresh();
    document.addEventListener("visibilitychange", visibility);
    if (event) window.addEventListener(event, refresh);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      if (event) window.removeEventListener(event, refresh);
    };
  }, dependencies);
}
export const unchangedData = (previous, next) =>
  JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
