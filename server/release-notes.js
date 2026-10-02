import { createHash } from "node:crypto";
export const releaseSections = ["Nouveautés", "Améliorations", "Corrections"];
export function releaseContext(store, notes, integrations, input) {
  const selected = input.item_ids ?? (input.item_id ? [input.item_id] : []);
  if (
    !Array.isArray(selected) ||
    selected.length > 20 ||
    selected.some((id) => typeof id !== "string") ||
    new Set(selected).size !== selected.length
  )
    throw Error("Choisissez au maximum 20 éléments livrés.");
  const all = store.list(),
    items = selected.map((id) =>
      all.find(
        (i) =>
          i.id === id &&
          !i.archived &&
          i.status === "done" &&
          i.visibility === "public",
      ),
    );
  if (items.some((i) => !i))
    throw Error(
      "Les éléments de la release note doivent être livrés, publics et non archivés.",
    );
  const signals = integrations?.signals() || [];
  const release = input.release_id
    ? signals.find(
        (s) =>
          s.id === input.release_id &&
          s.provider === "github" &&
          s.kind === "release" &&
          s.state === "published",
      )
    : null;
  if (input.release_id && !release)
    throw Error("Choisissez une version GitHub publiée.");
  if (!items.length && !release)
    throw Error("Choisissez un élément livré ou une version GitHub publiée.");
  const sources = items.map((i) => ({
    id: "item:" + i.id,
    kind: "gantt",
    title: i.title,
    text: i.title + "\n" + i.description,
    delivery: true,
  }));
  if (release)
    sources.push({
      id: "signal:" + release.id,
      kind: "release",
      title: release.title,
      text: release.title + "\n" + release.body,
      delivery: true,
    });
  const linked = signals.filter(
    (s) =>
      s.id !== release?.id &&
      s.provider === "github" &&
      ["pr", "commit", "ticket", "release"].includes(s.kind) &&
      (s.links?.some((id) => selected.includes(id)) ||
        (release &&
          s.source_id === release.source_id &&
          ((["pr", "ticket"].includes(s.kind) &&
            new RegExp(
              "(?:#|/pull/|/issues/)" + String(s.external_id) + "(?![0-9])",
            ).test(release.body || "")) ||
            (s.kind === "commit" &&
              (release.body || "").includes(String(s.external_id)))))),
  );
  for (const s of linked) {
    // An open issue or unmerged PR is not a release. Keep only completed engineering evidence.
    if (
      (s.kind === "pr" && s.state !== "merged") ||
      (s.kind === "ticket" && s.state !== "closed") ||
      (s.kind === "release" && s.state !== "published")
    )
      continue;
    sources.push({
      id: "signal:" + s.id,
      kind: s.kind,
      title: s.title,
      text: s.title + "\n" + s.body,
      delivery: s.kind === "release",
    });
  }
  for (const n of notes?.list() || []) {
    if (
      n.state === "archived" ||
      !n.linked?.some((id) => selected.includes(id))
    )
      continue;
    sources.push({
      id: "note:" + n.id,
      kind: "note",
      title: n.text.slice(0, 120),
      text: n.text,
      delivery: false,
    });
    if (
      store.db
        .prepare("SELECT name FROM sqlite_master WHERE name='ai_reviews'")
        .get()
    ) {
      const review = store.db
        .prepare(
          "SELECT result,context FROM ai_reviews WHERE scope='note' AND entity_id=? AND state='ready' ORDER BY created DESC LIMIT 1",
        )
        .get(n.id);
      if (review) {
        const old = JSON.parse(review.context).notes?.[0],
          summary = JSON.parse(review.result)?.summary;
        if (
          old?.text === n.text &&
          JSON.stringify(old.attachments || []) ===
            JSON.stringify(n.attachments || []) &&
          typeof summary === "string" &&
          summary.trim()
        )
          sources.push({
            id: "analysis:" + n.id,
            kind: "document",
            title: "Synthèse des pièces jointes",
            text: summary,
            delivery: false,
          });
      }
    }
    const files = store.db
      .prepare("SELECT name FROM sqlite_master WHERE name='note_attachments'")
      .get()
      ? store.db
          .prepare("SELECT id,name,text FROM note_attachments WHERE note_id=?")
          .all(n.id)
      : [];
    for (const f of files)
      if (f.text.trim())
        sources.push({
          id: "attachment:" + f.id,
          kind: "document",
          title: f.name,
          text: f.text,
          delivery: false,
        });
  }
  if (sources.length > 100 || JSON.stringify(sources).length > 52000)
    throw Error(
      "Trop de sources pour une seule release note : réduisez les éléments sélectionnés.",
    );
  sources.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(sources))
    .digest("hex");
  return {
    item_ids: selected,
    release_id: release?.id || null,
    version: release?.extra?.version || "",
    sources,
    fingerprint,
  };
}
export function validateReleaseAnswer(answer, context) {
  if (
    !answer ||
    !Array.isArray(answer.entries) ||
    !answer.entries.length ||
    answer.entries.length > 30
  )
    throw Error(
      "Aucune évolution suffisamment étayée pour préparer la release note.",
    );
  const sourceMap = new Map(context.sources.map((s) => [s.id, s]));
  const used = new Set();
  const texts = new Set();
  for (const entry of answer.entries) {
    if (
      !releaseSections.includes(entry.section) ||
      typeof entry.text !== "string" ||
      !entry.text.trim() ||
      entry.text.length > 500 ||
      /[\r\n]/.test(entry.text) ||
      !Array.isArray(entry.evidence) ||
      !entry.evidence.length ||
      entry.evidence.length > 6
    )
      throw Error("La release note proposée est invalide.");
    if (texts.has(entry.text.trim().toLocaleLowerCase()))
      throw Error("La release note contient des doublons.");
    texts.add(entry.text.trim().toLocaleLowerCase());
    let delivery = false;
    for (const evidence of entry.evidence) {
      const source = sourceMap.get(evidence.source_id);
      if (
        !source ||
        typeof evidence.quote !== "string" ||
        !evidence.quote.trim() ||
        evidence.quote.length > 300 ||
        !source.text.includes(evidence.quote)
      )
        throw Error(
          "Une information de la release note n’est pas étayée par ses sources.",
        );
      delivery ||= source.delivery;
      used.add(source.id);
    }
    if (!delivery)
      throw Error("Une évolution ne dispose pas de preuve de livraison.");
  }
  const body = releaseSections
    .map((section) => {
      const entries = answer.entries.filter((e) => e.section === section);
      return entries.length
        ? section + "\n" + entries.map((e) => "• " + e.text.trim()).join("\n")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (body.length > 8000) throw Error("La release note est trop longue.");
  return {
    title: context.version
      ? "Les nouveautés de " + context.version
      : "Les dernières nouveautés",
    body,
    version: context.version,
    item_ids: context.item_ids,
    release_id: context.release_id,
    sources: context.sources
      .filter((s) => used.has(s.id))
      .map(({ id, kind, title }) => ({ id, kind, title: title.slice(0, 180) })),
    source_counts: context.sources.reduce(
      (counts, s) => ({ ...counts, [s.kind]: (counts[s.kind] || 0) + 1 }),
      {},
    ),
    fingerprint: context.fingerprint,
  };
}
export function releaseSchema(context) {
  const evidence = {
    type: "object",
    required: ["source_id", "quote"],
    properties: {
      source_id: { type: "string", enum: context.sources.map((s) => s.id) },
      quote: { type: "string" },
    },
  };
  const entry = {
    type: "object",
    required: ["section", "text", "evidence"],
    properties: {
      section: { type: "string", enum: releaseSections },
      text: { type: "string" },
      evidence: { type: "array", items: evidence },
    },
  };
  return {
    type: "object",
    required: ["entries"],
    properties: { entries: { type: "array", maxItems: 30, items: entry } },
  };
}
