import { useEffect, useState } from "react";
export function usePersistentDraft(name, initial, personal = false) {
  const workspace =
    new URLSearchParams(location.search).get("workspace") || "pending";
  const key = `beam-draft:${personal ? "personal" : workspace}:${name}`;
  const read = () => {
    try {
      return JSON.parse((personal ? localStorage.getItem(key) : null) ?? sessionStorage.getItem(key) ?? (personal ? sessionStorage.getItem(`beam-draft:${workspace}:${name}`) : null)) ?? initial;
    } catch {
      return initial;
    }
  };
  const [entry, setEntry] = useState(() => ({ key, value: read() }));
  const value = entry.key === key ? entry.value : read();
  useEffect(() => {
    if (entry.key !== key) {
      setEntry({ key, value });
      return;
    }
    if (personal) sessionStorage.removeItem(`beam-draft:${workspace}:${name}`);
    try {
      if (value == null) { sessionStorage.removeItem(key); if(personal) localStorage.removeItem(key); }
      else { sessionStorage.setItem(key, JSON.stringify(value)); if(personal) localStorage.setItem(key, JSON.stringify(value)); }
    } catch { /* Storage limits must not interrupt typing. */ }
  }, [key, value, entry.key]);
  const setValue = (next) =>
    setEntry((previous) => {
      const nextValue = typeof next === "function" ? next(previous.key === key ? previous.value : read()) : next;
      try {
        for (const storage of personal ? [sessionStorage, localStorage] : [sessionStorage]) {
          if(nextValue == null) storage.removeItem(key);
          else storage.setItem(key, JSON.stringify(nextValue));
        }
      } catch { /* Keep the in-memory draft if storage is full. */ }
      return {key, value: nextValue};
    });
  return [value, setValue, () => {sessionStorage.removeItem(key);if(personal) localStorage.removeItem(key);}];
}
