import { createHash } from "node:crypto";
import { planningImpact, CHANGE_FIELDS } from "../shared/roadmap-impact.js";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const months = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];
function mentionedMonth(quote, created) {
  const normalized = quote
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const full = /\b(20\d{2})-(0[1-9]|1[0-2])-\d{2}\b/.exec(normalized);
  if (full) return { month: `${full[1]}-${full[2]}`, label: full[0] };
  const matches = [
    ...normalized.matchAll(
      /\b(?:a|en|pour|jusqu['’]?a|apres)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/g,
    ),
  ];
  if (matches.length !== 1 || !created) return null;
  const m = matches[0],
    index = months.indexOf(m[1]),
    date = new Date(created);
  const year = m[2]
    ? Number(m[2])
    : date.getUTCFullYear() + (index < date.getUTCMonth() ? 1 : 0);
  return {
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: m[1] + " " + year,
    inferred: !m[2],
  };
}
export function createGovernance(
  store,
  { notes, decisions, publications, integrations },
) {
  const db = store.db;
  db.exec(
    "CREATE TABLE IF NOT EXISTS contradiction_dismissals(fingerprint TEXT PRIMARY KEY,created TEXT)",
  );
  function preview(id, patch, cascade = false) {
    const items = store.list(),
      pubs = publications.list();
    const plan = planningImpact(items, pubs, id, patch, cascade);
    plan.token = hash([
      items.map((i) => [i.id, ...CHANGE_FIELDS.map((k) => i[k] ?? null)]),
      pubs.map((p) => [p.id, p.state, p.item_id, p.item_ids, p.release_id]),
      id,
      patch,
      cascade,
    ]);
    return plan;
  }
  function validatePlan(body) {
    const plan = preview(body.id, body.patch, body.cascade === true);
    if (typeof body.token !== "string" || body.token !== plan.token)
      throw Error(
        "La roadmap ou ses publications ont changé. Examinez à nouveau les impacts.",
      );
    return plan;
  }
  function contradictions() {
    const items = store.list().filter((i) => !i.archived),
      allNotes = notes.list(),
      rows = [];
    for (const d of decisions
      .list()
      .filter(
        (d) =>
          ["proposed", "confirmed"].includes(d.state) && d.kind === "defer",
      )) {
      const note = allNotes.find(
        (n) =>
          n.id === d.note_id &&
          n.state !== "archived" &&
          n.text === d.source_text,
      );
      if (!note) continue;
      const when = mentionedMonth(d.quote, note.created);
      if (!when) continue;
      for (const id of d.item_ids) {
        const item = items.find((i) => i.id === id);
        if (
          !item?.end_date ||
          item.status === "done" ||
          item.end_date.slice(0, 7) >= when.month
        )
          continue;
        const fingerprint = hash([
          "defer",
          d.id,
          note.text,
          id,
          item.end_date,
          item.status,
        ]);
        rows.push({
          id: "contradiction:" + fingerprint,
          fingerprint,
          kind: "contradiction",
          item_id: id,
          note_id: note.id,
          title: item.title,
          reason: `Un report vers ${when.label} est mentionné, mais la fin reste au ${item.end_date}. ${d.state === "proposed" ? "La décision reste à confirmer. " : ""}${when.inferred ? "L’année est interprétée à partir de la date de la note ; vérifiez-la." : ""}`,
          sources: [
            {
              id: "note:" + note.id,
              title: d.quote,
              kind: "Note · " + note.created.slice(0, 10),
            },
          ],
        });
      }
    }
    // A published version is a signal to check, not proof that an entire feature shipped.
    const signals = integrations.signals();
    for (const p of publications
      .list()
      .filter((p) => p.state === "published" && p.release_id)) {
      const release = signals.find(
        (s) =>
          s.id === p.release_id &&
          s.kind === "release" &&
          s.state === "published",
      );
      if (!release) continue;
      for (const id of new Set([p.item_id, ...(p.item_ids || [])])) {
        const item = items.find((i) => i.id === id && i.status !== "done");
        if (!item) continue;
        const fingerprint = hash([
          "release",
          p.id,
          release.id,
          release.updated,
          id,
          item.status,
        ]);
        rows.push({
          id: "contradiction:" + fingerprint,
          fingerprint,
          kind: "contradiction",
          item_id: id,
          title: item.title,
          reason: `La publication ${p.version || p.title} cite cet élément et sa version GitHub est publiée, alors que son état reste « ${item.status === "progress" ? "En cours" : "À venir"} ». Vérifiez le périmètre livré avant de changer l’état.`,
          sources: [
            {
              id: "release:" + release.id,
              title: release.title,
              kind: "Version GitHub publiée",
              url: release.url,
            },
            { id: "publication:" + p.id, title: p.title, kind: "Publication" },
          ],
        });
      }
    }
    for (const release of signals.filter(
      (s) => s.kind === "release" && s.state === "published",
    )) {
      for (const id of release.links || []) {
        const item = items.find((i) => i.id === id && i.status !== "done");
        if (
          !item ||
          release.updated < item.created ||
          rows.some(
            (r) =>
              r.item_id === id &&
              r.sources.some((s) => s.id === "release:" + release.id),
          )
        )
          continue;
        const fingerprint = hash([
          "linked-release",
          release.id,
          release.updated,
          id,
          item.status,
        ]);
        rows.push({
          id: "contradiction:" + fingerprint,
          fingerprint,
          kind: "contradiction",
          item_id: id,
          title: item.title,
          reason: `La version ${release.title} associée à cet élément est publiée, mais l’élément reste « ${item.status === "progress" ? "En cours" : "À venir"} ». Ce lien ne prouve pas une livraison complète : vérifiez son périmètre.`,
          sources: [
            {
              id: "release:" + release.id,
              title: release.title,
              kind: "Version associée",
              url: release.url,
            },
          ],
        });
      }
    }
    return rows.filter(
      (r) =>
        !db
          .prepare("SELECT 1 FROM contradiction_dismissals WHERE fingerprint=?")
          .get(r.fingerprint),
    );
  }
  return {
    preview,
    validatePlan,
    contradictions,
    dismiss(fingerprint) {
      if (!contradictions().some((r) => r.fingerprint === fingerprint))
        throw Error("Cet écart n’est plus d’actualité.");
      db.prepare(
        "INSERT OR IGNORE INTO contradiction_dismissals VALUES(?,?)",
      ).run(fingerprint, new Date().toISOString());
    },
  };
}
