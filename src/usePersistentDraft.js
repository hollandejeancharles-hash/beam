import { useEffect, useState } from "react";
export function usePersistentDraft(name, initial, personal = false) {
  const workspace =
    new URLSearchParams(location.search).get("workspace") || "pending";
  const key = `beam-draft:${personal ? "personal" : workspace}:${name}`;
  const read = () => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? (personal ? sessionStorage.getItem(`beam-draft:${workspace}:${name}`) : null)) ?? initial;
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
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value, entry.key]);
  const setValue = (next) =>
    setEntry((previous) => ({
      key,
      value:
        typeof next === "function"
          ? next(previous.key === key ? previous.value : read())
          : next,
    }));
  return [value, setValue, () => sessionStorage.removeItem(key)];
}
