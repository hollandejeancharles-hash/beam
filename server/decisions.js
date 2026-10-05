import { randomUUID, createHash } from "node:crypto";
export const DECISION_KINDS = [
  "defer",
  "prioritize",
  "approve",
  "reject",
  "decision",
];
export function validateDecisions(values, context) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 2)
    throw Error("Décisions proposées invalides");
  return values.map((d) => {
    const n = context.notes.find((n) => n.id === d.note_id);
    if (
      !n ||
      typeof d.quote !== "string" ||
      !d.quote.trim() ||
      d.quote.length > 3000 ||
      !n.text.includes(d.quote) ||
      typeof d.title !== "string" ||
      !d.title.trim() ||
      d.title.length > 160 ||
      typeof d.reason !== "string" ||
      d.reason.length > 1000 ||
      !DECISION_KINDS.includes(d.kind) ||
      !Array.isArray(d.item_ids) ||
      d.item_ids.length > 8 ||
      d.item_ids.some((id) => !context.items.some((i) => i.id === id))
    )
      throw Error("Décision sans source vérifiable");
    return { ...d, item_ids: [...new Set(d.item_ids)] };
  });
}
export function createDecisions(store, {notes} = {}) {
  const db = store.db;
  db.exec(
    `CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,title TEXT,reason TEXT,kind TEXT,note_id TEXT,quote TEXT,source_text TEXT,item_ids TEXT,state TEXT,created TEXT,confirmed TEXT,fingerprint TEXT UNIQUE);`,
  );
  const read = (r) => (r ? { ...r, item_ids: JSON.parse(r.item_ids) } : null);
  const list = () =>
    db
      .prepare("SELECT * FROM decisions ORDER BY created DESC,id")
      .all()
      .map(read);
  const insert = (d, state) => {
    const note = notes ? notes.list().find(n=>n.id===d.note_id) : db.prepare("SELECT * FROM notes WHERE id=?").get(d.note_id);
    if (!note || note.state === "archived" || note.text !== d.source_text)
      throw Error("La note source a changé. Relancez l’analyse.");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          d.note_id,
          d.quote,
          d.source_text,
          [...d.item_ids].sort(),
          d.kind,
        ]),
      )
      .digest("hex");
    const existing = db
      .prepare("SELECT * FROM decisions WHERE fingerprint=?")
      .get(fingerprint);
    if (existing) {
      if (state === "confirmed" && existing.state !== "confirmed") {
        db.prepare(
          "UPDATE decisions SET state=?,confirmed=?,title=?,reason=? WHERE id=?",
        ).run(
          "confirmed",
          new Date().toISOString(),
          d.title.trim(),
          d.reason.trim(),
          existing.id,
        );
        return read(
          db.prepare("SELECT * FROM decisions WHERE id=?").get(existing.id),
        );
      }
      return read(existing);
    }
    const id = randomUUID(),
      created = new Date().toISOString();
    db.prepare("INSERT INTO decisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(
      id,
      d.title.trim(),
      d.reason.trim(),
      d.kind,
      d.note_id,
      d.quote,
      note.text,
      JSON.stringify(d.item_ids),
      state,
      created,
      state === "confirmed" ? created : null,
      fingerprint,
    );
    return read(db.prepare("SELECT * FROM decisions WHERE id=?").get(id));
  };
  return {
    list,
    context(items, notes) {
      return list()
        .filter(
          (d) =>
            d.state === "confirmed" &&
            (d.item_ids.some((id) => items.some((i) => i.id === id)) ||
              notes.some((n) => n.id === d.note_id)),
        )
        .map(({ id, title, reason, kind, item_ids, quote, confirmed }) => ({
          id,
          title,
          reason,
          kind,
          item_ids,
          quote,
          confirmed,
        }));
    },
    propose(values, context) {
      for (const d of validateDecisions(values, context))
        insert(
          {
            ...d,
            source_text: context.notes.find((n) => n.id === d.note_id).text,
          },
          "proposed",
        );
    },
    save(input) {
      const context = {
        notes: notes ? notes.list().filter(n=>n.state!=="archived") : db.prepare("SELECT * FROM notes WHERE state<>?").all("archived"),
        items: store.list().filter((i) => !i.archived),
      };
      const [d] = validateDecisions([input], context);
      return insert(
        {
          ...d,
          source_text: context.notes.find((n) => n.id === d.note_id).text,
        },
        "confirmed",
      );
    },
    decide(id, state) {
      if (!["confirmed", "dismissed", "archived"].includes(state))
        throw Error("État de décision invalide");
      const d = read(db.prepare("SELECT * FROM decisions WHERE id=?").get(id));
      if (!d) throw Error("Décision introuvable");
      if (state === "confirmed") {
        if (d.state !== "proposed") throw Error("Décision déjà traitée");
        const n = notes ? notes.list().find(n=>n.id===d.note_id) : db.prepare("SELECT * FROM notes WHERE id=?").get(d.note_id);
        if (!n || n.state === "archived" || n.text !== d.source_text)
          throw Error("La note source a changé. Relancez l’analyse.");
        if (
          d.item_ids.some(
            (id) => !store.list().some((i) => i.id === id && !i.archived),
          )
        )
          throw Error("Un élément lié n’est plus disponible");
      } else if (state === "dismissed" && d.state !== "proposed")
        throw Error("Décision déjà traitée");
      db.prepare("UPDATE decisions SET state=?,confirmed=? WHERE id=?").run(
        state,
        state === "confirmed" ? new Date().toISOString() : d.confirmed,
        id,
      );
      return read(db.prepare("SELECT * FROM decisions WHERE id=?").get(id));
    },
  };
}
