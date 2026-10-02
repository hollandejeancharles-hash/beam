const normalize = (s) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const NOTE_KINDS = {
  action: "À faire",
  followup: "À relancer",
  decision: "Décision",
  feedback: "Retour",
  idea: "Idée",
  note: "Note",
};
export function interpretNote(text, items = [], now = new Date()) {
  const t = normalize(text);
  const kind = /\b(relancer|relance|attente|attend|recontacter)\b/.test(t)
    ? "followup"
    : /\b(decision|decide|valide|validation|acte|retenu)\b/.test(t)
      ? "decision"
      : /\b(envoyer|preparer|verifier|faire|appeler|contacter|penser|rappeler|a faire)\b/.test(
            t,
          )
        ? "action"
        : /\b(retour|feedback|bug|probleme|client|plainte)\b/.test(t)
          ? "feedback"
          : /\b(idee|pourrait|pourquoi pas|suggestion)\b/.test(t)
            ? "idea"
            : "note";
  const people = [...text.matchAll(/@([\p{L}][\p{L}\p{N}_-]*)/gu)].map(
    (m) => m[1],
  );
  const named = text.match(
    /\b(?:avec|relancer|appeler|contacter|recontacter|envoyer à|retour de)\s+([A-ZÀ-Ý][\p{L}-]+)/iu,
  );
  if (named && /^[A-ZÀ-Ý]/.test(named[1]) && !people.includes(named[1]))
    people.push(named[1]);
  const prefix = text.match(/^([A-ZÀ-Ý][\p{L}-]+)\s*[:—]/u);
  if (
    prefix &&
    ![
      "decision",
      "idee",
      "retour",
      "note",
      "action",
      "urgent",
      "bug",
      "client",
    ].includes(normalize(prefix[1])) &&
    !people.includes(prefix[1])
  )
    people.push(prefix[1]);
  const tags = [
    ...new Set([...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1])),
  ];
  let due = null;
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  if (/\bdemain\b/.test(t)) {
    date.setDate(date.getDate() + 1);
    due = date;
  } else if (/\baujourd'hui\b/.test(t)) due = date;
  else {
    const relative = t.match(/\bdans\s+(\d{1,2})\s+jours?\b/);
    if (relative) {
      date.setDate(date.getDate() + Number(relative[1]));
      due = date;
    }
    const weekdays = [
      "dimanche",
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
    ];
    const day = weekdays.findIndex((d) =>
      new RegExp("\\b" + d + "\\b").test(t),
    );
    if (day >= 0) {
      date.setDate(date.getDate() + ((day - date.getDay() + 7) % 7 || 7));
      due = date;
    }
    const explicit = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (
      explicit &&
      !Number.isNaN(Date.parse(explicit[0])) &&
      new Date(explicit[0]).toISOString().slice(0, 10) === explicit[0]
    )
      due = new Date(explicit[0] + "T12:00:00");
  }
  const stop = new Set([
    "pour",
    "dans",
    "avec",
    "plus",
    "les",
    "des",
    "une",
    "mon",
    "notre",
    "qui",
    "sur",
  ]);
  const linked = items
    .filter((item) => {
      const words =
        normalize(item.title)
          .match(/[a-z0-9]{4,}/g)
          ?.filter((w) => !stop.has(w)) || [];
      return (
        words.length &&
        (t.includes(normalize(item.title)) ||
          words.filter((w) => new RegExp("\\b" + w + "\\b").test(t)).length >=
            Math.min(2, words.length))
      );
    })
    .slice(0, 3)
    .map((i) => i.id);
  return {
    kind,
    people: [...new Set(people)],
    tags,
    due: due
      ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`
      : null,
    linked,
  };
}
