// Only current, actionable analysis appears in the inbox. Earlier runs stay in history.
export function buildInbox({
  reviews = [],
  notes = [],
  items = [],
  topics = [],
  matches = [],
}) {
  const queue = [],
    latest = new Set(),
    noteById = new Map(notes.map((n) => [n.id, n])),
    itemById = new Map(items.map((i) => [i.id, i]));
  for (const r of reviews) {
    const key = r.scope + ":" + r.entity_id;
    if (latest.has(key)) continue;
    latest.add(key);
    if (r.state !== "ready") continue;
    const entity =
      r.scope === "note"
        ? noteById.get(r.entity_id)
        : itemById.get(r.entity_id);
    if (!entity || entity.archived || entity.state === "archived") continue;
    for (const [index, p] of (r.result?.proposals || []).entries()) {
      if (p.applied || p.dismissed) continue;
      const evidence = (p.note_ids || []).map((id) =>
        r.context?.notes?.find((n) => n.id === id),
      );
      if (
        evidence.some(
          (n) =>
            !n ||
            !noteById.has(n.id) ||
            noteById.get(n.id).state === "archived" ||
            noteById.get(n.id).text !== n.text ||
            JSON.stringify(noteById.get(n.id).attachments || []) !==
              JSON.stringify(n.attachments || []),
        )
      )
        continue;
      if (
        p.action !== "create" &&
        (!itemById.has(p.item_id) || itemById.get(p.item_id).archived)
      )
        continue;
      queue.push({
        id: `proposal:${r.id}:${index}`,
        kind: "proposal",
        review_id: r.id,
        index,
        scope: r.scope,
        entity_id: r.entity_id,
        title: p.title,
        reason: p.reason,
        description: p.description,
        action: p.action,
        item_id: p.item_id,
        created: r.created,
        sources: [
          ...evidence.map((n) => ({
            id: "note:" + n.id,
            title: n.text,
            kind: "Note",
          })),
          ...(p.signal_ids || [])
            .map((id) => r.context?.signals?.find((s) => s.id === id))
            .filter(Boolean)
            .map((s) => ({
              id: "signal:" + s.id,
              title: s.title,
              kind: "Information",
              url: s.url,
            })),
        ],
      });
    }
  }
  for (const m of matches.filter((m) => m.confidence === "review"))
    queue.push({
      id: "association:" + m.source + ":" + m.item_id,
      kind: "association",
      source: m.source,
      item_id: m.item_id,
      title: m.item_title,
      reason:
        m.reason ||
        "L’assistant a identifié un lien possible avec cet élément. Ce rapprochement reste à confirmer.",
      sources: [{ id: m.source, title: m.title, kind: "Source" }],
    });
  for (const t of topics)
    for (const s of t.sources.filter((s) => s.confidence === "review"))
      queue.push({
        id: "topic:" + t.id + ":" + s.id,
        kind: "topic",
        topic_id: t.id,
        source: s.id,
        title: t.title,
        reason:
          "Cette source pourrait appartenir à ce sujet. Vérifiez le rapprochement avant de le confirmer.",
        sources: [{ id: s.id, title: s.title, kind: s.kind, url: s.url }],
      });
  return queue;
}
