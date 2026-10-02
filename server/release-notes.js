import { createHash } from "node:crypto";
export const releaseSections = ["Nouveautés", "Améliorations", "Corrections"];
export function releaseContext(store, notes, integrations, input, logs) {
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
  if (!release) throw Error("Choisissez la version GitHub de la release note.");
  if (
    !logs ||
    logs.release_id !== release.id ||
    logs.source_id !== release.source_id ||
    logs.version !== release.extra.version ||
    !logs.commits?.length
  )
    throw Error("Les logs complets de cette version sont requis.");
  const shas = new Set(logs.commits.map((c) => c.sha));
  const refs = new Set(
    logs.commits.flatMap((c) =>
      [...c.message.matchAll(/#(\d+)\b/g)].map((m) => m[1]),
    ),
  );
  const versionSignals = signals.filter(
    (s) =>
      s.source_id === release.source_id &&
      ((s.kind === "commit" && shas.has(s.external_id)) ||
        (s.kind === "pr" &&
          s.state === "merged" &&
          (shas.has(s.extra?.merge_sha) || refs.has(String(s.external_id))))),
  );
  const selected = [...new Set(versionSignals.flatMap((s) => s.links || []))];
  const items = store
    .list()
    .filter(
      (i) =>
        selected.includes(i.id) &&
        !i.archived &&
        i.visibility === "public" &&
        i.status === "done",
    );
  const itemIds = items.map((i) => i.id);
  const sources = logs.commits.map((c) => ({
    id: "commit:" + c.sha,
    kind: "commit",
    title: c.message.split("\n")[0].slice(0, 180),
    text: c.message,
    delivery: true,
  }));
  sources.push({
    id: "signal:" + release.id,
    kind: "release",
    title: release.title,
    text: release.title + "\n" + release.body,
    delivery: false,
  });
  for (const i of items)
    sources.push({
      id: "item:" + i.id,
      kind: "gantt",
      title: i.title,
      text: i.title + "\n" + i.description,
      delivery: false,
    });
  for (const s of versionSignals.filter((s) => s.kind === "pr"))
    sources.push({
      id: "signal:" + s.id,
      kind: "pr",
      title: s.title,
      text: s.title + "\n" + s.body,
      delivery: false,
    });
  for (const n of notes?.list() || []) {
    if (n.state === "archived" || !n.linked?.some((id) => itemIds.includes(id)))
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
  if (sources.length > 600 || JSON.stringify(sources).length > 52000)
    throw Error(
      "Les logs de cette version dépassent la capacité d’analyse. Aucun brouillon partiel ne sera généré.",
    );
  sources.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({ sources, base: logs.base_sha, head: logs.head_sha }),
    )
    .digest("hex");
  return {
    item_ids: itemIds,
    base_ref: logs.base_ref,
    base_sha: logs.base_sha,
    head_sha: logs.head_sha,
    commit_count: logs.commits.length,
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
      entry.evidence.length > 3
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
      throw Error(
        "Chaque évolution doit citer un commit des logs de cette version.",
      );
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
    base_ref: context.base_ref,
    commit_count: context.commit_count,
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
      evidence: { type: "array", maxItems: 3, items: evidence },
    },
  };
  return {
    type: "object",
    required: ["entries"],
    properties: { entries: { type: "array", maxItems: 30, items: entry } },
  };
}
