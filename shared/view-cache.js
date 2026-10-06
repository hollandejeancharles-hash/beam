// Small local snapshots speed up first paint; the server remains authoritative.
const memory = new Map();
const prefix = 'beam:view-cache:v1:';
export function readViewCache(key, storage, now = Date.now()) {
  if (memory.has(key)) return memory.get(key);
  try {
    const entry = JSON.parse(storage?.getItem(prefix + key) || 'null');
    if (!entry || now - entry.at > 86400000 || entry.at > now) return null;
    memory.set(key, entry.value);
    return entry.value;
  } catch { return null; }
}
export function writeViewCache(key, value, storage, now = Date.now()) {
  memory.set(key, value);
  try {
    const encoded = JSON.stringify({at:now,value});
    if (encoded.length <= 2000000) storage?.setItem(prefix + key, encoded);
    else storage?.removeItem(prefix + key);
  } catch { /* Full or unavailable storage must never block editing. */ }
}
