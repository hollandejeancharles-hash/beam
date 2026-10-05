import React, { useState, useEffect, useRef } from "react";
import { Plus, ArrowRight, Close, MessageSquare } from "../icons";
import AIProgress from "./AIProgress";
const kinds = { request: "Demande", bug: "Bug", improvement: "Amélioration" };
const priorities = {
  unrated: "À qualifier",
  high: "Haute",
  medium: "Normale",
  low: "Basse",
};
const labels = {
  review: "À examiner",
  clarify: "À clarifier",
  accepted: "Reliée à la roadmap",
  deferred: "Différée",
  rejected: "Refusée",
  merged: "Regroupée",
};
async function hash(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function DemandCapture({ note, api, onClose, onError, onDone }) {
  const [excerpt, setExcerpt] = useState((note?.text || "").slice(0, 5000)),
    [drafts, setDrafts] = useState([
      { title: "", description: "", request_id: crypto.randomUUID() },
    ]),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState([]);
  const captureRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    captureRef.current?.querySelector("textarea")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function captureKeys(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
    }
    if (e.key === "Tab") {
      const fields = [
        ...captureRef.current.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
        ),
      ].filter((el) => el.offsetParent !== null);
      const first = fields[0],
        last = fields.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }
  async function payload() {
    return note
      ? { note_id: note.id, note_hash: await hash(note.text), excerpt }
      : { excerpt };
  }
  async function analyze() {
    setBusy(true);
    try {
      const result = await api("admin/demands/analyze", {
        method: "POST",
        body: JSON.stringify(await payload()),
      });
      setDrafts(
        result.drafts.map((d) => ({ ...d, request_id: crypto.randomUUID() })),
      );
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function publish(e) {
    e.preventDefault();
    setBusy(true);
    const complete = [...sent];
    try {
      const source = await payload();
      for (let i = 0; i < drafts.length; i++) {
        if (complete.includes(i)) continue;
        await api("admin/demands", {
          method: "POST",
          body: JSON.stringify({
            ...source,
            request_id: drafts[i].request_id,
            title: drafts[i].title,
            description: drafts[i].description,
          }),
        });
        complete.push(i);
        setSent([...complete]);
      }
      onDone();
      onClose();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={captureRef}
      role="dialog"
      aria-modal="true"
      aria-label={note ? "Partager une demande" : "Nouvelle demande"}
      className="demand-capture"
      onSubmit={publish}
      onKeyDown={captureKeys}
    >
      <header>
        <div>
          <small>DEMANDES</small>
          <h2>{note ? "Partager une demande" : "Nouvelle demande"}</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Fermer"
        >
          <Close size={20} />
        </button>
      </header>
      <p className="subtle">
        {note
          ? "Seul cet extrait sera partagé avec le workspace. Votre note et ses pièces jointes restent personnelles."
          : "Décrivez le besoin. Cette demande restera à examiner avant toute planification."}
      </p>
      <label>
        Extrait à analyser
        <textarea
          value={excerpt}
          disabled={busy || sent.length > 0}
          onChange={(e) => setExcerpt(e.target.value)}
          maxLength={5000}
          rows={5}
          placeholder="Collez un retour, un besoin ou un échange…"
        />
      </label>
      <button
        className="button"
        type="button"
        disabled={busy || !excerpt.trim() || sent.length > 0}
        onClick={analyze}
      >
        Préparer avec l’IA locale{" "}
        <AIProgress
          scope="demand"
          fallback={busy ? { state: "running", phase: "Analyse locale" } : null}
        />
      </button>
      {drafts.map((d, i) => (
        <fieldset key={i} disabled={busy || sent.includes(i)}>
          <legend>
            Demande {i + 1}
            {sent.includes(i) ? " · envoyée" : ""}
          </legend>
          <label>
            Titre
            <input
              required
              maxLength={140}
              value={d.title}
              onChange={(e) =>
                setDrafts(
                  drafts.map((x, j) =>
                    j === i ? { ...x, title: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Besoin
            <textarea
              required
              maxLength={5000}
              rows={3}
              value={d.description}
              onChange={(e) =>
                setDrafts(
                  drafts.map((x, j) =>
                    j === i ? { ...x, description: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          {d.quote && <blockquote>{d.quote}</blockquote>}
          {d.question && <p className="subtle">À clarifier : {d.question}</p>}
          {drafts.length > 1 && !sent.length && (
            <button
              type="button"
              className="text-button"
              onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
            >
              Retirer cette proposition
            </button>
          )}
        </fieldset>
      ))}
      <footer>
        <button
          className="button primary"
          disabled={
            busy || drafts.some((d) => !d.title.trim() || !d.description.trim())
          }
        >
          {busy ? "Traitement…" : "Envoyer à examiner"}
          <ArrowRight size={16} />
        </button>
      </footer>
    </form>
  );
}
export default function Demands({
  api,
  items,
  readOnly,
  onError,
  onPrepare,
  target,
  onOpenItem,
  onQueueChanged,
}) {
  const [data, setData] = useState({
      demands: [],
      profiles: [],
      shared: false,
    }),
    [loaded, setLoaded] = useState(false),
    [selected, setSelected] = useState(null),
    [view, setView] = useState("review"),
    [query, setQuery] = useState(""),
    [mine, setMine] = useState(false),
    [editing, setEditing] = useState(null),
    [capture, setCapture] = useState(false),
    [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const apiRef = useRef(api);
  apiRef.current = api;
  async function load() {
    try {
      const next = await apiRef.current("admin/demands");
      setData(next);
      setLoaded(true);
      onQueueChanged?.(next.demands.filter((d) => d.data.state === "review"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    window.addEventListener("beam-demands-changed", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beam-demands-changed", load);
    };
  }, []);
  useEffect(() => {
    if (target?.id) {
      setSelected(target.id);
      setView("all");
    }
  }, [target]);
  const current = data.demands.find((d) => d.id === selected),
    analysis =
      proposal ||
      data.analyses?.find(
        (a) => a.id === selected && a.revision === current?.revision,
      )?.data,
    profile = (id) =>
      data.profiles.find((p) => p.user_id === id)?.name ||
      (id === "local" ? "Vous" : "Membre du workspace");
  const shown = data.demands.filter(
    (d) =>
      (view === "all" ||
        (view === "done"
          ? ["accepted", "deferred", "rejected", "merged"].includes(
              d.data.state,
            )
          : d.data.state === view)) &&
      (!mine || d.data.reviewer === data.userId) &&
      `${d.data.title} ${d.data.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function update(fields) {
    setBusy(true);
    try {
      await api(`admin/demands/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...fields, revision: current.revision }),
      });
      setReason("");
      await load();
    } catch (e) {
      onError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function merge(targetId) {
    const target = data.demands.find((d) => d.id === targetId);
    if (!target) return;
    if (
      !window.confirm(
        `Regrouper « ${current.data.title} » avec « ${target.data.title} » ? Les sources seront conservées et la demande d’origine restera dans l’historique.`,
      )
    )
      return;
    setBusy(true);
    try {
      await api("admin/demands/merge", {
        method: "POST",
        body: JSON.stringify({
          id: current.id,
          revision: current.revision,
          target_id: target.id,
          target_revision: target.revision,
          reason: reason || "Même besoin, regroupement validé manuellement",
        }),
      });
      await load();
      setSelected(target.id);
      setProposal(null);
    } catch (e) {
      onError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setProposal(null);
    try {
      setProposal(
        await api("admin/demands/analyze", {
          method: "POST",
          body: JSON.stringify({
            id: current.id,
            excerpt: current.data.description || current.data.title,
          }),
        }),
      );
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="demands-screen">
      <div className="toolbar">
        <div className="demand-tabs">
          {[
            ["review", "À examiner"],
            ["clarify", "À clarifier"],
            ["done", "Traitées"],
            ["all", "Toutes"],
          ].map(([id, label]) => (
            <button
              className="button"
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
              <span className="subtle">
                {
                  data.demands.filter(
                    (d) =>
                      id === "all" ||
                      (id === "done"
                        ? [
                            "accepted",
                            "deferred",
                            "rejected",
                            "merged",
                          ].includes(d.data.state)
                        : d.data.state === id),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        {!readOnly && (
          <button className="button" onClick={() => setCapture(true)}>
            <Plus size={15} />
            Nouvelle demande
          </button>
        )}
      </div>
      {error ? (
        <div className="empty">
          <h3>La file est indisponible</h3>
          <p>{error}</p>
          <button className="button" onClick={load}>
            Réessayer
          </button>
        </div>
      ) : !loaded ? (
        <div className="empty">Chargement des demandes…</div>
      ) : (
        <div className="demand-layout">
          <section className="demand-queue">
            <input
              aria-label="Rechercher une demande"
              placeholder="Rechercher une demande…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {data.userId && (
              <label className="demand-mine">
                <input
                  type="checkbox"
                  checked={mine}
                  onChange={(e) => setMine(e.target.checked)}
                />
                M’assignées
              </label>
            )}
            <small>
              {data.shared ? "PARTAGÉ AVEC LE WORKSPACE" : "SUR CE MAC"}
            </small>
            {shown.map((r) => (
              <button
                className="demand-row"
                id={`suggestion-${r.id}`}
                key={r.id}
                aria-pressed={r.id === selected}
                onClick={() => {
                  setSelected(r.id);
                  setEditing(null);
                  setProposal(null);
                  setReason("");
                }}
              >
                <span className={`demand-dot ${r.data.state}`} />
                <div>
                  <strong>{r.data.title}</strong>
                  <p>{r.data.description}</p>
                  <small>
                    {labels[r.data.state]} ·{" "}
                    {r.data.reviewer
                      ? profile(r.data.reviewer)
                      : "Non attribuée"}
                  </small>
                </div>
                <time>
                  {new Date(r.created_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </time>
              </button>
            ))}
            {!shown.length && (
              <div className="empty">
                <MessageSquare size={26} />
                <h3>Tout est à jour</h3>
                <p>
                  Les retours du portail et les extraits de notes que vous
                  partagez arriveront ici.
                </p>
              </div>
            )}
          </section>
          <section className="demand-detail">
            {current ? (
              <>
                <small>{labels[current.data.state]}</small>
                <h2>{current.data.title}</h2>
                <p className="demand-description">{current.data.description}</p>
                {!readOnly && current.data.state !== "merged" && (
                  <>
                    {!editing ? (
                      <button
                        className="text-button"
                        onClick={() =>
                          setEditing({
                            title: current.data.title,
                            description: current.data.description,
                            revision: current.revision,
                          })
                        }
                      >
                        Modifier la demande
                      </button>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editing.revision === current.revision) {
                            void update({
                              title: editing.title,
                              description: editing.description,
                            });
                            setEditing(null);
                          }
                        }}
                      >
                        <label>
                          Titre
                          <input
                            required
                            maxLength={140}
                            value={editing.title}
                            onChange={(e) =>
                              setEditing({ ...editing, title: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Besoin
                          <textarea
                            required
                            rows={4}
                            maxLength={5000}
                            value={editing.description}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        {editing.revision !== current.revision && (
                          <p>
                            La demande a changé. Annulez et ouvrez sa nouvelle
                            version.
                          </p>
                        )}
                        <button
                          className="button"
                          disabled={
                            busy || editing.revision !== current.revision
                          }
                        >
                          Enregistrer
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          Annuler
                        </button>
                      </form>
                    )}
                    <div className="demand-fields">
                      <label>
                        Type
                        <select
                          disabled={busy}
                          value={current.data.kind || "request"}
                          onChange={(e) => update({ kind: e.target.value })}
                        >
                          {Object.entries(kinds).map(([id, label]) => (
                            <option value={id} key={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Priorité
                        <select
                          disabled={busy}
                          value={current.data.priority || "unrated"}
                          onChange={(e) => update({ priority: e.target.value })}
                        >
                          {Object.entries(priorities).map(([id, label]) => (
                            <option value={id} key={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}
                <label>
                  Responsable du triage
                  <select
                    disabled={readOnly || busy}
                    value={current.data.reviewer || ""}
                    onChange={(e) => update({ reviewer: e.target.value })}
                  >
                    <option value="">Non attribuée</option>
                    {data.profiles.map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {current.data.sources?.length > 0 && (
                  <section>
                    <h3>À l’origine de la demande</h3>
                    {current.data.sources.map((s, i) => (
                      <div className="demand-source" key={i}>
                        <small>
                          {s.title} ·{" "}
                          {new Date(s.at).toLocaleDateString("fr-FR")}
                        </small>
                        <blockquote>{s.quote || current.data.title}</blockquote>
                        {s.author && <small>{s.author}</small>}
                        {typeof s.url === "string" &&
                          /^https:\/\/(slack\.com|[a-z0-9-]+\.slack\.com|teams\.microsoft\.com)\//.test(
                            s.url,
                          ) && (
                            <a href={s.url} target="_blank" rel="noreferrer">
                              {s.url_kind === "channel"
                                ? "Ouvrir le canal Slack"
                                : "Ouvrir la conversation"}
                            </a>
                          )}
                      </div>
                    ))}
                  </section>
                )}
                {current.data.item_id && (
                  <button
                    className="text-button"
                    onClick={() =>
                      onOpenItem(
                        items.find((i) => i.id === current.data.item_id),
                      )
                    }
                  >
                    Ouvrir{" "}
                    {items.find((i) => i.id === current.data.item_id)?.title ||
                      "l’élément lié"}
                    <ArrowRight size={14} />
                  </button>
                )}
                {!readOnly && current.data.state !== "merged" && (
                  <>
                    <section className="demand-intelligence">
                      <header>
                        <h3>Éclairage de l’assistant</h3>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={analyze}
                        >
                          {busy ? "Analyse…" : "Analyser"}
                          <AIProgress scope="demand" />
                        </button>
                      </header>
                      <p className="subtle">
                        L’assistant local examine les demandes en arrière-plan
                        lorsqu’il est activé. Ses propositions restent à
                        valider.
                      </p>
                      {analysis?.drafts.map((d, i) => (
                        <div key={i}>
                          <strong>{d.title}</strong>
                          <blockquote>{d.quote}</blockquote>
                          {d.question && <p>À clarifier : {d.question}</p>}
                          {d.duplicate_id && (
                            <div>
                              <p>
                                Demande similaire :{" "}
                                {
                                  data.demands.find(
                                    (x) => x.id === d.duplicate_id,
                                  )?.data.title
                                }
                              </p>
                              <blockquote>{d.duplicate_quote}</blockquote>
                              <button
                                className="button"
                                disabled={busy || !!current.data.item_id}
                                onClick={() => merge(d.duplicate_id)}
                              >
                                Regrouper après vérification
                              </button>
                            </div>
                          )}
                          {d.related && (
                            <button
                              className="button"
                              disabled={busy}
                              onClick={() =>
                                update({
                                  item_id: d.related,
                                  state: "accepted",
                                })
                              }
                            >
                              Relier à{" "}
                              {items.find((x) => x.id === d.related)?.title}
                            </button>
                          )}
                        </div>
                      ))}
                    </section>
                    <section>
                      <h3>Décider de la suite</h3>
                      <label>
                        Relier à un élément existant
                        <select
                          disabled={busy}
                          value={current.data.item_id || ""}
                          onChange={(e) => {
                            if (e.target.value)
                              update({
                                item_id: e.target.value,
                                state: "accepted",
                                reason,
                              });
                          }}
                        >
                          <option value="">
                            Choisir une initiative, un projet ou une feature
                          </option>
                          {items
                            .filter((i) => !i.archived)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      {current.data.item_id ? (
                        <div className="demand-linked-result">
                          <strong>
                            Cette demande est déjà reliée à la roadmap.
                          </strong>
                          <p>
                            Vous pouvez ouvrir l’élément ou choisir un autre
                            rattachement ci-dessus.
                          </p>
                          <button
                            className="button"
                            disabled={
                              !items.some(
                                (item) => item.id === current.data.item_id,
                              )
                            }
                            onClick={() =>
                              onOpenItem(
                                items.find(
                                  (item) => item.id === current.data.item_id,
                                ),
                              )
                            }
                          >
                            Ouvrir{" "}
                            {items.find(
                              (item) => item.id === current.data.item_id,
                            )?.title || "l’élément"}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      ) : ["review", "clarify"].includes(current.data.state) ? (
                        <>
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() =>
                              onPrepare({
                                ...current.data,
                                _demand_id: current.id,
                                _demand_revision: current.revision,
                                _change_reason: reason,
                              })
                            }
                          >
                            Créer une feature…
                            <ArrowRight size={14} />
                          </button>
                          <p className="subtle">
                            Vérifiez la feature dans le formulaire. Elle sera
                            créée et reliée à cette demande uniquement après
                            l’enregistrement.
                          </p>
                        </>
                      ) : (
                        <p className="subtle">
                          Remettez cette demande à examiner pour créer une
                          feature.
                        </p>
                      )}
                      <label>
                        Contexte de la décision
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Pourquoi cette décision ?"
                        />
                      </label>
                      {!reason.trim() && (
                        <p className="subtle">
                          Pour différer ou refuser, indiquez le contexte de la
                          décision.
                        </p>
                      )}
                      <div className="demand-actions">
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            update({
                              state:
                                current.data.state === "clarify"
                                  ? "review"
                                  : "clarify",
                              reason,
                            })
                          }
                        >
                          {current.data.state === "clarify"
                            ? "À examiner"
                            : "À clarifier"}
                        </button>
                        <button
                          className="button"
                          disabled={busy || !reason.trim()}
                          onClick={() => update({ state: "deferred", reason })}
                        >
                          Différer
                        </button>
                        <button
                          className="button"
                          disabled={busy || !reason.trim()}
                          onClick={() => update({ state: "rejected", reason })}
                        >
                          Refuser
                        </button>
                        {[
                          "accepted",
                          "deferred",
                          "rejected",
                          "merged",
                        ].includes(current.data.state) && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              update({ state: "review", item_id: null, reason })
                            }
                          >
                            Réexaminer
                          </button>
                        )}
                      </div>
                    </section>
                  </>
                )}
                {current.data.merged_into && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(current.data.merged_into);
                      setView("all");
                    }}
                  >
                    Voir la demande regroupée
                    <ArrowRight size={14} />
                  </button>
                )}
                <section>
                  <h3>Historique</h3>
                  {[...(current.data.history || [])].reverse().map((h, i) => (
                    <div className="demand-history" key={i}>
                      <strong>
                        {labels[h.state]} · {profile(h.actor)}
                      </strong>
                      <small>{new Date(h.at).toLocaleString("fr-FR")}</small>
                      {h.reason && <p>{h.reason}</p>}
                    </div>
                  ))}
                </section>
              </>
            ) : (
              <div className="empty">
                <h3>Chaque demande mérite du contexte.</h3>
                <p>
                  Sélectionnez un retour pour comprendre le besoin, consulter sa
                  source et décider de la suite.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {capture && (
        <div className="demand-overlay">
          <DemandCapture
            api={api}
            onError={onError}
            onClose={() => setCapture(false)}
            onDone={load}
          />
        </div>
      )}
    </div>
  );
}
