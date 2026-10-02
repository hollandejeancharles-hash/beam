import React, { useEffect, useState } from "react";
import { Activity, RefreshCw, CheckCheck, Close, ArrowRight } from "../icons";
import { NOTE_KINDS } from "../../shared/notes";
const priorities = { high: "Haute", medium: "Normale", low: "Basse" };
export default function LocalAssistant({
  api,
  scope = "notes",
  entity,
  items,
  notes = [],
  onRefresh,
}) {
  const [status, setStatus] = useState(null),
    [reviews, setReviews] = useState([]),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [noteId, setNoteId] = useState("");
  const feature = scope === "feature";
  async function load() {
    try {
      const [s, r] = await Promise.all([
        api("admin/ai/status"),
        api("admin/ai/reviews"),
      ]);
      setStatus(s);
      setReviews(r);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) void load();
    };
    refresh();
    window.addEventListener("beam:notes", refresh);
    const timer = setInterval(refresh, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("beam:notes", refresh);
    };
  }, [entity?.id]);
  async function action(task) {
    setBusy(true);
    setError("");
    try {
      await task();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const latest = new Map();
  reviews
    .filter((r) =>
      feature
        ? r.scope === "feature" && r.entity_id === entity.id
        : r.scope === "note",
    )
    .forEach((r) => {
      if (!latest.has(r.entity_id)) latest.set(r.entity_id, r);
    });
  const shown = [...latest.values()].slice(0, feature ? 1 : 12);
  const pending = shown.filter((r) =>
    ["queued", "running"].includes(r.state),
  ).length;
  return (
    <section className="local-assistant" aria-label="Assistant local">
      <div className="assistant-heading">
        <Activity size={17} />
        <div>
          <strong>Assistant local</strong>
          <small>
            {!status
              ? "Connexion…"
              : !status.available
                ? "Ollama indisponible"
                : !status.installed
                  ? "Modèle à installer"
                  : status.enabled
                    ? "Ministral 3 · Sur ce Mac"
                    : "Ministral 3 · En pause"}
            {pending ? ` · ${pending} analyse(s) en cours` : ""}
          </small>
        </div>
        <button
          type="button"
          className="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Refermer"
            : feature
              ? "Proposer des mises à jour"
              : "Propositions"}
        </button>
      </div>
      {expanded && (
        <div className="assistant-content">
          <p className="assistant-help">
            Vos notes et les sources associées sont analysées sur ce Mac. Chaque
            changement de roadmap attend votre validation.
          </p>
          {status && (
            <div className="assistant-controls">
              <button
                type="button"
                className="button"
                disabled={
                  busy ||
                  (!status.enabled && (!status.available || !status.installed))
                }
                onClick={() =>
                  action(() =>
                    api("admin/ai/settings", {
                      method: "PATCH",
                      body: JSON.stringify({ enabled: !status.enabled }),
                    }),
                  )
                }
              >
                {status.enabled ? "Mettre en pause" : "Activer l’assistant"}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Vérifier la connexion IA"
                onClick={() => void load()}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}
          {status && !status.available && (
            <p className="assistant-help">
              Le moteur local n’est pas démarré. Relancez Beam après
              l’installation d’Ollama. Vos notes restent utilisables.
            </p>
          )}
          {status?.available && !status.installed && (
            <p className="assistant-help">
              Installez Ministral 3 8B dans Ollama pour activer l’analyse
              locale.
            </p>
          )}
          <div className="assistant-controls">
            {!feature && (
              <select
                aria-label="Note à analyser"
                value={noteId}
                onChange={(e) => setNoteId(e.target.value)}
              >
                <option value="">Choisir une note existante…</option>
                {notes
                  .filter((n) => n.state !== "archived")
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.text.slice(0, 85)}
                    </option>
                  ))}
              </select>
            )}
            <button
              type="button"
              className="button"
              disabled={
                busy ||
                pending > 0 ||
                !status?.enabled ||
                !status?.installed ||
                (!feature && !noteId)
              }
              onClick={() =>
                action(() =>
                  api("admin/ai/analyze", {
                    method: "POST",
                    body: JSON.stringify({
                      scope: feature ? "feature" : "note",
                      id: feature ? entity.id : noteId,
                    }),
                  }),
                )
              }
            >
              <Activity size={14} />
              {pending
                ? "Analyse en cours…"
                : feature
                  ? "Analyser les notes et sources"
                  : "Analyser cette note"}
            </button>
          </div>
          {!feature && status?.enabled && (
            <p className="assistant-help">
              Les nouvelles notes sont analysées automatiquement après leur
              sauvegarde. Leur classement reste inchangé jusqu’à votre
              validation.
            </p>
          )}
          {error && (
            <p role="alert" className="source-error">
              {error}
            </p>
          )}
          {!shown.length && (
            <p className="assistant-help">
              {feature
                ? "Associez une note ou un ticket à cette feature, puis lancez l’analyse."
                : "Les propositions de vos notes apparaîtront ici."}
            </p>
          )}
          {shown.map((r) => (
            <article className="assistant-review" key={r.id}>
              {!feature && <blockquote>{r.context.notes[0]?.text}</blockquote>}
              {["queued", "running"].includes(r.state) ? (
                <p role="status" className="assistant-help">
                  {r.state === "queued"
                    ? "En attente…"
                    : "Lecture et préparation des propositions…"}
                </p>
              ) : r.state === "error" ? (
                <p role="alert" className="source-error">
                  {r.error}
                </p>
              ) : (
                <>
                  <p className="assistant-summary">{r.result.summary}</p>
                  {r.scope === "note" && (
                    <div className="assistant-classification">
                      <strong>Classement proposé</strong>
                      <p>
                        {NOTE_KINDS[r.result.classification.kind]}
                        {r.result.classification.people.length
                          ? " · " + r.result.classification.people.join(", ")
                          : ""}
                        {r.result.classification.due
                          ? " · " + r.result.classification.due
                          : ""}
                      </p>
                      <p>
                        {r.result.classification.tags
                          .map((t) => "#" + t)
                          .join(" ")}
                        {r.result.classification.linked
                          .map(
                            (id) =>
                              " · " +
                              (items.find((i) => i.id === id)?.title ||
                                "Feature supprimée"),
                          )
                          .join("")}
                      </p>
                      <button
                        type="button"
                        className="button"
                        disabled={busy || r.result.classification_applied}
                        onClick={() =>
                          action(async () => {
                            await api(`admin/ai/reviews/${r.id}/apply`, {
                              method: "POST",
                              body: JSON.stringify({ index: "classification" }),
                            });
                            await onRefresh?.();
                          })
                        }
                      >
                        {r.result.classification_applied
                          ? "Classement appliqué"
                          : "Appliquer le classement"}
                      </button>
                    </div>
                  )}
                  {r.result.proposals.map((p, index) => {
                    const target = items.find((i) => i.id === p.item_id);
                    return (
                      <div className="assistant-proposal" key={index}>
                        <small>
                          {p.action === "create"
                            ? "Nouvelle feature · Interne"
                            : "Mise à jour · " + (target?.title || p.title)}
                        </small>
                        <h4>{p.title}</h4>
                        <p>{p.reason}</p>
                        {p.description && (
                          <div className="assistant-diff">
                            <small>
                              {p.action === "create"
                                ? "Description proposée"
                                : "Ajout à la description"}
                            </small>
                            <p>{p.description}</p>
                          </div>
                        )}
                        {p.priority && (
                          <p className="assistant-help">
                            Priorité :{" "}
                            {target ? priorities[target.priority] + " → " : ""}
                            {priorities[p.priority]}
                          </p>
                        )}
                        {target?.visibility === "public" && p.description && (
                          <p className="assistant-public-notice">
                            Cette feature est publique : cet ajout sera visible
                            sur le portail local. La publication GitHub Pages
                            reste séparée.
                          </p>
                        )}
                        <details>
                          <summary>
                            Voir les sources (
                            {p.note_ids.length + p.signal_ids.length})
                          </summary>
                          {p.note_ids.map((id) => (
                            <blockquote key={id}>
                              {r.context.notes.find((n) => n.id === id)?.text}
                            </blockquote>
                          ))}
                          {p.signal_ids.map((id) => {
                            const s = r.context.signals.find(
                              (s) => s.id === id,
                            );
                            return (
                              s && (
                                <a
                                  key={id}
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {s.title}
                                  <ArrowRight size={12} />
                                </a>
                              )
                            );
                          })}
                        </details>
                        <div className="assistant-controls">
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy || p.applied || p.dismissed}
                            onClick={() =>
                              action(async () => {
                                await api(`admin/ai/reviews/${r.id}/apply`, {
                                  method: "POST",
                                  body: JSON.stringify({ index }),
                                });
                                await onRefresh?.();
                              })
                            }
                          >
                            <CheckCheck size={13} />
                            {p.applied
                              ? "Appliqué"
                              : p.dismissed
                                ? "Ignoré"
                                : p.action === "create"
                                  ? "Créer cette feature interne"
                                  : "Appliquer cette proposition"}
                          </button>
                          {!p.applied && !p.dismissed && (
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                action(() =>
                                  api(`admin/ai/reviews/${r.id}/dismiss`, {
                                    method: "POST",
                                    body: JSON.stringify({ index }),
                                  }),
                                )
                              }
                            >
                              <Close size={13} />
                              Ignorer
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!r.result.proposals.length && (
                    <p className="assistant-help">
                      Aucune modification de roadmap proposée.
                    </p>
                  )}
                </>
              )}
              {r.state === "error" && (
                <button
                  type="button"
                  className="button"
                  disabled={busy || !status?.enabled}
                  onClick={() =>
                    action(() =>
                      api("admin/ai/analyze", {
                        method: "POST",
                        body: JSON.stringify({
                          scope: r.scope,
                          id: r.entity_id,
                        }),
                      }),
                    )
                  }
                >
                  Réessayer
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
