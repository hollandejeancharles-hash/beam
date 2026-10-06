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
  onOpenSource,
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
        <h2>Propositions à vérifier</h2>
        <p>
          Vérifiez la note concernée et son classement proposé. Rien n’est validé sans votre accord.
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
                      ? "Classement d’une note"
                      : "Roadmap · Rapprochement incertain"}
            </small>
            <h3>{row.kind === "topic" ? "Classer cette note dans ce dossier ?" : row.title}</h3>
            {row.kind === "topic" ? (
              <>
                <div className="review-placement">
                  <span>Dossier proposé</span>
                  <strong>{row.title}</strong>
                  {row.topic_summary && <p>{row.topic_summary}</p>}
                </div>
                <p className="review-uncertainty">Beam a proposé ce classement, mais le lien reste incertain. Est-ce bien le même sujet ?</p>
              </>
            ) : <p>{row.reason}</p>}
            <div className="review-evidence">
              <small>{row.kind === "topic" ? "Note à classer" : "Informations concernées"}</small>
              {row.sources.map((s) => (
                <div className="review-inbox-source" key={s.id}>
                  <small>{s.kind}</small>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    <blockquote>{s.text || s.title}</blockquote>
                  )}
                  {s.id?.startsWith("note:") && onOpenSource && <button className="text-button" onClick={() => onOpenSource(s.id.slice(5))}>Ouvrir la note <ArrowRight size={13} /></button>}
                </div>
              ))}
            </div>
            {row.kind === "topic" && <small className="review-consequence">Le contenu de la note reste inchangé. Ce classement remplace ses autres rattachements aux dossiers intelligents.</small>}
            <div className="review-inbox-actions">
              <button
                className="text-button"
                disabled={busy !== null}
                onClick={() => decide(row, false)}
              >
                {row.kind === "topic" ? "Ne pas regrouper" : "Ignorer cette proposition"}
              </button>
              <button
                className="button"
                disabled={busy !== null}
                onClick={(event) => onExamine(row, event.currentTarget)}
              >
                {row.kind === "topic" ? "Voir le dossier" : row.kind === "proposal" ? "Voir la modification" : "Voir le contexte"} <ArrowRight size={14} />
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
                      : row.kind === "topic" ? "Classer dans ce dossier" : "Associer à cet élément"}
                </button>
              )}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
