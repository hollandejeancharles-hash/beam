import { buildSearchRecords } from "../shared/search.js";
export function createSearch({
  store,
  notes,
  topics,
  integrations,
  publications,
  decisions,
  productFlows,
  demands,
}) {
  return () =>
    buildSearchRecords({
      items: store.list(),
      notes: notes.list(),
      topics: topics.list().topics.map((t) => ({
        ...t,
        summary: [
          t.summary,
          ...(productFlows?.list(t.id) || []).map((b) =>
            Object.values(b.content).join(" "),
          ),
        ].join(" "),
      })),
      signals: integrations.signals(),
      sources: integrations
        .list()
        .map(({ id, label, provider, scope, url }) => ({
          id,
          label,
          provider,
          scope,
          url,
        })),
      publications: publications.list(),
      decisions: decisions?.list() || [],
      demands: demands?.cached() || [],
      suggestions: demands
        ? []
        : store.db.prepare("SELECT * FROM suggestions").all(),
      attachments: store.db
        .prepare("SELECT id,note_id,name,text FROM note_attachments")
        .all(),
    });
}
