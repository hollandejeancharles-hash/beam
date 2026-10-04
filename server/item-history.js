import { randomUUID } from "node:crypto";
import { CHANGE_FIELDS } from "../shared/roadmap-impact.js";
export function createItemHistory(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS item_history(id TEXT PRIMARY KEY,item_id TEXT,batch_id TEXT,actor TEXT,reason TEXT,created TEXT,before_json TEXT,after_json TEXT,undo_of TEXT)",
  );
  const read = (r) => ({
    ...r,
    before: JSON.parse(r.before_json),
    after: JSON.parse(r.after_json),
  });
  function record(before, after, meta = {}) {
    if (!before || !after) return;
    const fields = CHANGE_FIELDS.filter(
      (k) =>
        JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null),
    );
    if (!fields.length) return;
    const take = (x) =>
      Object.fromEntries(fields.map((k) => [k, x[k] ?? null]));
    db.prepare("INSERT INTO item_history VALUES(?,?,?,?,?,?,?,?,?)").run(
      randomUUID(),
      after.id,
      meta.batch_id || randomUUID(),
      meta.actor || "Sur ce Mac",
      String(meta.reason || "").slice(0, 1000),
      new Date().toISOString(),
      JSON.stringify(take(before)),
      JSON.stringify(take(after)),
      meta.undo_of || null,
    );
  }
  function list(id) {
    return db
      .prepare(
        "SELECT * FROM item_history WHERE item_id=? ORDER BY created DESC,rowid DESC LIMIT 50",
      )
      .all(id)
      .map(read);
  }
  function undo(id, items) {
    const row = db.prepare("SELECT * FROM item_history WHERE id=?").get(id);
    if (!row) throw Error("Modification introuvable.");
    const rows = db
      .prepare("SELECT rowid AS sequence,* FROM item_history WHERE batch_id=?")
      .all(row.batch_id)
      .map(read);
    return rows.map((r) => {
      const item = items.find((i) => i.id === r.item_id);
      const newer = db
        .prepare(
          "SELECT after_json FROM item_history WHERE item_id=? AND rowid>?",
        )
        .all(r.item_id, r.sequence);
      if (
        newer.some((n) =>
          Object.keys(JSON.parse(n.after_json)).some((k) =>
            Object.hasOwn(r.after, k),
          ),
        )
      )
        throw Error(
          "Ces valeurs ont été modifiées depuis. L’annulation ne peut pas écraser une décision plus récente.",
        );
      if (
        !item ||
        Object.keys(r.after).some(
          (k) =>
            JSON.stringify(item[k] ?? null) !==
            JSON.stringify(r.after[k] ?? null),
        )
      )
        throw Error(
          "Un élément a changé depuis cette modification. L’annulation ne peut pas écraser ces changements.",
        );
      return { id: r.item_id, patch: r.before };
    });
  }
  return { record, list, undo };
}
