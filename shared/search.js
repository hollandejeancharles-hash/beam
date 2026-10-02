export const normalizeSearch = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export const includesSearch = (query, ...values) => {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  const hay = normalizeSearch(values.flat().join(" "));
  return terms.every((term) => hay.includes(term));
};
export function matchSearchContent(query, label, content = "") {
  const q = normalizeSearch(query);
  if (!q) return null;
  const title = normalizeSearch(label),
    hay = normalizeSearch(content);
  if (title === q)
    return {
      score: 1000,
      idx: Array.from({ length: label.length }, (_, i) => i),
    };
  const at = title.indexOf(q);
  if (at >= 0)
    return {
      score: 800 - at,
      idx: Array.from({ length: q.length }, (_, i) => at + i),
    };
  const terms = q.split(" ");
  if (terms.every((t) => (title + " " + hay).includes(t)))
    return {
      score: 400 + terms.filter((t) => title.includes(t)).length * 50,
      idx: [],
    };
  return null;
}
const types = {
    initiative: "Initiative",
    project: "Projet",
    feature: "Feature",
  },
  states = { planned: "À venir", progress: "En cours", done: "Livré" };
export function buildSearchRecords(
  {
    items = [],
    notes = [],
    attachments = [],
    topics = [],
    signals = [],
    sources = [],
    publications = [],
    suggestions = [],
    decisions = [],
  },
  publicOnly = false,
) {
  const records = [];
  const add = (kind, id, title, body, hint, archived = false, targetId = id) =>
    records.push({
      kind,
      id,
      title: title || "Sans titre",
      body: String(body || ""),
      hint,
      archived: !!archived,
      targetId,
    });
  for (const i of items) {
    if (publicOnly && (i.visibility !== "public" || i.archived)) continue;
    add(
      "item",
      i.id,
      i.title,
      [
        i.description,
        types[i.type],
        states[i.status],
        i.category,
        i.owner,
        i.quarter,
        i.priority,
        i.start_date,
        i.end_date,
      ]
        .filter(Boolean)
        .join(" "),
      types[i.type] || "Feature",
      i.archived,
    );
  }
  for (const p of publications) {
    if (publicOnly && (p.state ? p.state !== "published" : !p.published))
      continue;
    add(
      "publication",
      p.id,
      p.title,
      [p.body, p.version].join(" "),
      "Publication · " +
        ({ draft: "Brouillon", published: "Publiée", archived: "Archivée" }[
          p.state
        ] || "Publiée"),
      p.state === "archived",
    );
  }
  if (publicOnly) return records;
  for (const d of decisions)
    if (d.state !== "dismissed")
      add(
        "decision",
        d.id,
        d.title,
        [d.reason, d.quote, d.kind].join(" "),
        "Décision · " +
          (d.state === "confirmed"
            ? "Validée"
            : d.state === "archived"
              ? "Archivée"
              : "À confirmer"),
        d.state === "archived",
        d.note_id,
      );
  for (const n of notes)
    add(
      "note",
      n.id,
      n.text.split("\n")[0].slice(0, 160),
      [n.text, ...(n.people || []), ...(n.tags || []), n.due]
        .filter(Boolean)
        .join(" "),
      "Note",
      n.state === "archived",
    );
  for (const a of attachments) {
    const n = notes.find((n) => n.id === a.note_id);
    if (n)
      add(
        "attachment",
        a.id,
        a.name,
        a.text,
        "Document joint · Note",
        n.state === "archived",
        n.id,
      );
  }
  for (const t of topics)
    add(
      "topic",
      t.id,
      t.title,
      [t.summary, ...(t.questions || [])].join(" "),
      "Sujet",
    );
  for (const s of signals)
    add(
      "signal",
      s.id,
      s.title,
      [
        s.body,
        s.external_id,
        "#" + s.external_id,
        s.source_label,
        s.extra?.version,
        s.state,
        s.kind,
      ]
        .filter(Boolean)
        .join(" "),
      ({
        ticket: "Ticket",
        pr: "Pull request",
        commit: "Commit",
        release: "Version",
        build: "Exécution",
        document: "Document",
      }[s.kind] || "Information") +
        " · " +
        s.source_label,
    );
  for (const s of sources)
    add(
      "source",
      s.id,
      s.label,
      [s.provider, s.scope, s.url].join(" "),
      "Intégration",
    );
  for (const s of suggestions)
    add("suggestion", s.id, s.title, s.description, "Suggestion", s.archived);
  return records;
}
