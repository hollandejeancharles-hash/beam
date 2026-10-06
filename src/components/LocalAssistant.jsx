import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import AIProgress from "./AIProgress";
import React, { useState, useEffect } from "react";
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
  settingsOnly = false,
  onData,
  sharedData,
  initialExpanded = false,
  readOnly = false,
}) {
  const [status, setStatus] = useState(null),
    [reviews, setReviews] = useState([]),
    [expanded, setExpanded] = useState(initialExpanded || scope === "note"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [noteId, setNoteId] = useState("");
  const feature = scope === "feature";
  const singleNote = scope === "note";
  async function load() {
    try {
      const [s, r] = await Promise.all([
        api("admin/ai/status"),
        api("admin/ai/reviews"),
      ]);
      setStatus((previous) => unchangedData(previous, s));
      setReviews((previous) => unchangedData(previous, r));
      onData?.({ status: s, reviews: r });
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (sharedData) {
      setStatus(previous => unchangedData(previous, sharedData.status));
      setReviews(previous => unchangedData(previous, sharedData.reviews || []));
    }
  }, [sharedData]);
  useVisiblePolling(
    sharedData ? async () => {} : load,
    reviews.some((r) => ["queued", "running"].includes(r.state)) ? 4000 : 12000,
    [entity?.id, Boolean(sharedData)],
    "beam:notes",
  );
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
        : r.scope === "note" && (!singleNote || r.entity_id === entity.id),
    )
    .forEach((r) => {
      if (!latest.has(r.entity_id)) latest.set(r.entity_id, r);
    });
  const shown = settingsOnly
    ? []
    : [...latest.values()].slice(0, feature || singleNote ? 1 : 12);
  const pending = shown.filter((r) =>
    ["queued", "running"].includes(r.state),
  ).length;
  return (
    <section
      className={
        "local-assistant" +
        (settingsOnly ? " assistant-settings" : "") +
        (singleNote ? " assistant-note-detail" : "") +
        (feature ? " assistant-feature-detail" : "")
      }
      aria-label="Assistant local"
    >
      <div className="assistant-heading">
        <Activity size={17} />
        <div>
          <strong>
            {settingsOnly
              ? "Classement assisté"
              : singleNote
                ? "Suite proposée"
                : feature
                  ? "Analyse des sources"
                  : "Assistant local"}
          </strong>
          <small>
            {!status
              ? "Connexion…"
              : !status.available
                ? "Ollama indisponible"
                : !status.installed
                  ? "Modèle à installer"
                  : status.enabled
                    ? "Actif · Sur ce Mac"
                    : "En pause · Sur ce Mac"}
            {pending ? ` · ${pending} analyse(s) en cours` : ""}
          </small>
        </div>
        <AIProgress
          itemId={feature ? entity.id : undefined}
          noteId={singleNote ? entity.id : undefined}
          scope={feature ? "feature" : singleNote ? "note" : undefined}
        />
        <button
          type="button"
          className="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            if (
              feature &&
              !expanded &&
              !shown.length &&
              status?.enabled &&
              status?.available &&
              status?.installed
            )
              action(() =>
                api("admin/ai/analyze", {
                  method: "POST",
                  body: JSON.stringify({ scope: "feature", id: entity.id }),
                }),
              );
          }}
        >
          {expanded
            ? "Refermer"
            : settingsOnly
              ? "Réglages"
              : feature
                ? shown.length
                  ? "Voir les propositions"
                  : "Analyser"
                : "Propositions"}
        </button>
      </div>
      {expanded && (
        <div className="assistant-content">
          {!singleNote && !feature && (
            <p className="assistant-help">
              Vos notes et les sources pertinentes sont repérées et analysées
              sur ce Mac. Chaque changement de roadmap attend votre validation.
            </p>
          )}
          {status && !singleNote && (!feature || !status.enabled) && (
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
          {!settingsOnly && (
            <div className="assistant-controls">
              {!feature && !singleNote && (
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
                  (!feature && !singleNote && !noteId)
                }
                onClick={() =>
                  action(() =>
                    api("admin/ai/analyze", {
                      method: "POST",
                      body: JSON.stringify({
                        scope: feature ? "feature" : "note",
                        id: feature || singleNote ? entity.id : noteId,
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
                    : shown.length
                      ? "Relancer l’analyse"
                      : "Analyser cette note"}
              </button>
            </div>
          )}
          {!feature && !singleNote && status?.enabled && (
            <p className="assistant-help">
              L’IA intervient uniquement lorsque vous lancez une analyse.
              Les propositions restent à valider ; écrire ou ouvrir une note
              ne déclenche aucun traitement.
            </p>
          )}
          {error && (
            <p role="alert" className="source-error">
              {error}
            </p>
          )}
          {!settingsOnly && !shown.length && (
            <p className="assistant-help">
              {feature
                ? "L’IA recherche les notes, tickets et documents pertinents avant d’analyser cet élément. Les liens ambigus restent à vérifier."
                : singleNote
                  ? "Lancez l’analyse pour suggérer un classement et identifier les suites à donner à cette note."
                  : "Les propositions de vos notes apparaîtront ici."}
            </p>
          )}
          {shown.map((r) => (
            <article className="assistant-review" key={r.id}>
              {!feature && !singleNote && (
                <blockquote>{r.context.notes[0]?.text}</blockquote>
              )}
              {["queued", "running"].includes(r.state) ? (
                <div className="assistant-help" role="status">
                  <AIProgress
                    jobId={r.id}
                    fallback={{ ...r, ...r.progress }}
                    showLabel
                    size={28}
                  />
                </div>
              ) : r.state === "error" ? (
                <p role="alert" className="source-error">
                  {r.error}
                </p>
              ) : (
                <>
                  <p className="assistant-summary">{r.result.summary}</p>
                  {r.scope === "note" &&
                    !(singleNote && r.result.classification_applied) && (
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
                                body: JSON.stringify({
                                  index: "classification",
                                }),
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
                        {items?.some((i) => i._revision !== undefined) &&
                          !p.applied && (
                            <p className="assistant-help">
                              En validant, vous partagez le texte de cette
                              proposition avec votre équipe. Les notes sources
                              restent sur ce Mac.
                            </p>
                          )}
                        <div className="assistant-controls">
                          <button
                            type="button"
                            className="button primary"
                            disabled={
                              busy || p.applied || p.dismissed || readOnly
                            }
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
