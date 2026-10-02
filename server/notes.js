import { randomUUID } from "node:crypto";
import { interpretNote, NOTE_KINDS } from "../shared/notes.js";
export function createNotes(store) {
  const db = store.db;
  db.exec(
    "CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, text TEXT NOT NULL, details TEXT NOT NULL, state TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL)",
  );
  const decode = (n) => ({
    ...n,
    ...JSON.parse(n.details),
    details: undefined,
    attachments: db
      .prepare("SELECT name FROM sqlite_master WHERE name='note_attachments'")
      .get()
      ? db
          .prepare(
            "SELECT id,name,mime,pages,length(bytes) AS size FROM note_attachments WHERE note_id=?",
          )
          .all(n.id)
      : [],
  });
  return {
    list: () =>
      db.prepare("SELECT * FROM notes ORDER BY created DESC").all().map(decode),
    save(input, id = randomUUID(), { automatic = false } = {}) {
      const old = db.prepare("SELECT * FROM notes WHERE id=?").get(id);
      if (
        input.text !== undefined &&
        (typeof input.text !== "string" ||
          !input.text.trim() ||
          input.text.length > 5000)
      )
        throw Error("Une note doit contenir entre 1 et 5 000 caractères.");
      const text = input.text?.trim() || old?.text;
      if (!text) throw Error("Note introuvable");
      const previous = old ? JSON.parse(old.details) : {};
      const locked = previous.manual_fields || [];
      const details = {
        ...(old && old.text === text
          ? JSON.parse(old.details)
          : interpretNote(text, store.list())),
        ...Object.fromEntries(
          Object.entries(input.classification || {}).filter(
            ([key]) =>
              ["kind", "people", "tags", "due", "linked"].includes(key) &&
              (!automatic || !locked.includes(key)),
          ),
        ),
      };
      details.manual_fields = automatic
        ? locked
        : [...new Set([...locked, ...Object.keys(input.classification || {})])];
      if (
        !Object.hasOwn(NOTE_KINDS, details.kind) ||
        !Array.isArray(details.people) ||
        !Array.isArray(details.tags) ||
        !Array.isArray(details.linked) ||
        [...details.people, ...details.tags, ...details.linked].some(
          (v) => typeof v !== "string" || v.length > 140,
        ) ||
        (details.due &&
          (!/^20\d{2}-\d{2}-\d{2}$/.test(details.due) ||
            Number.isNaN(Date.parse(details.due)) ||
            new Date(details.due).toISOString().slice(0, 10) !== details.due))
      )
        throw Error("Classement invalide");
      if (details.linked.some((id) => !store.list().some((i) => i.id === id)))
        throw Error("Élément de roadmap introuvable");
      const state = input.state || old?.state || "open";
      if (!["open", "done", "archived"].includes(state))
        throw Error("État invalide");
      const now = new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO notes VALUES(?,?,?,?,?,?)").run(
        id,
        text,
        JSON.stringify(details),
        state,
        old?.created || now,
        now,
      );
      return decode(db.prepare("SELECT * FROM notes WHERE id=?").get(id));
    },
  };
}
