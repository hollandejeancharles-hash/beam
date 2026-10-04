import React, { useState } from "react";
import { ArrowRight, CheckCheck } from "../icons";
import { includesSearch } from "../../shared/search";
export default function ReviewInbox({
  rows,
  loading,
  query,
  api,
  onRefresh,
  onError,
  onExamine,
}) {
  const [busy, setBusy] = useState(null);
  const visible = rows.filter((r) =>
    includesSearch(query, r.title, r.reason, ...r.sources.map((s) => s.title)),
  );
  async function decide(row, accept) {
    setBusy(row.id);
    try {
      if (row.kind === "contradiction")
        await api("admin/contradictions/dismiss", {
          method: "POST",
          body: JSON.stringify({ fingerprint: row.fingerprint }),
        });
      else if (row.kind === "decision")
        await api("admin/decisions/" + row.decision_id, {
          method: "PATCH",
          body: JSON.stringify({ state: accept ? "confirmed" : "dismissed" }),
        });
      else if (row.kind === "proposal")
        await api(`admin/ai/reviews/${row.review_id}/dismiss`, {
          method: "POST",
          body: JSON.stringify({ index: row.index }),
        });
      else if (row.kind === "association")
        await api("admin/associations/decide", {
          method: "POST",
          body: JSON.stringify({
            source: row.source,
            item_id: row.item_id,
            accept,
          }),
        });
      else
        await api("admin/topics/move", {
          method: "POST",
          body: JSON.stringify({
            source: row.source,
            topic_id: accept ? row.topic_id : null,
          }),
        });
      await onRefresh();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="review-inbox" aria-label="Informations à examiner">
      <div className="review-inbox-intro">
        <h2>Ce qui mérite votre attention</h2>
        <p>
          L’assistant rapproche vos informations. Vous décidez des suites à
          donner.
        </p>
      </div>
      {loading ? (
        <p role="status">Chargement des propositions…</p>
      ) : !visible.length ? (
        <div className="empty">
          <CheckCheck size={24} />
          <h3>{query ? "Aucun résultat" : "Tout est au clair"}</h3>
          <p>
            {query
              ? "Essayez un autre mot."
              : "Les prochaines propositions apparaîtront ici après les analyses."}
          </p>
        </div>
      ) : (
        visible.map((row) => (
          <article className="review-inbox-card" key={row.id}>
            <small>
              {row.kind === "contradiction"
                ? "Écart à vérifier"
                : row.kind === "decision"
                  ? "Décision à confirmer"
                  : row.kind === "proposal"
                    ? row.action === "create"
                      ? "Nouvelle feature proposée"
                      : "Mise à jour proposée"
                    : row.kind === "topic"
                      ? "Sujet · Rapprochement incertain"
                      : "Roadmap · Rapprochement incertain"}
            </small>
            <h3>{row.title}</h3>
            <p>{row.reason}</p>
            <details>
              <summary>Sources · {row.sources.length}</summary>
              {row.sources.map((s) => (
                <div className="review-inbox-source" key={s.id}>
                  <small>{s.kind}</small>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    <p>{s.title}</p>
                  )}
                </div>
              ))}
            </details>
            <div className="review-inbox-actions">
              <button
                className="text-button"
                disabled={busy !== null}
                onClick={() => decide(row, false)}
              >
                Ignorer
              </button>
              <button
                className="button"
                disabled={busy !== null}
                onClick={(event) => onExamine(row, event.currentTarget)}
              >
                Examiner <ArrowRight size={14} />
              </button>
              {!["proposal", "contradiction"].includes(row.kind) && (
                <button
                  className="button primary"
                  disabled={busy !== null}
                  onClick={() => decide(row, true)}
                >
                  {busy === row.id
                    ? "Enregistrement…"
                    : row.kind === "decision"
                      ? "Confirmer la décision"
                      : "Confirmer le lien"}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
