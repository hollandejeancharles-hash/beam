import { buildSearchRecords } from "../shared/search.js";
export function createSearch({
  store,
  notes,
  topics,
  integrations,
  publications,
  decisions,
}) {
  return () =>
    buildSearchRecords({
      items: store.list(),
      notes: notes.list(),
      topics: topics.list().topics,
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
      suggestions: store.db.prepare("SELECT * FROM suggestions").all(),
      attachments: store.db
        .prepare("SELECT id,note_id,name,text FROM note_attachments")
        .all(),
    });
}
