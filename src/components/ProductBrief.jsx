import React, { useEffect, useState } from "react";
import AIProgress from "./AIProgress";
const labels = {
  problem: "Problème à résoudre",
  users: "Utilisateurs concernés",
  outcome: "Résultat attendu",
  questions: "Questions ouvertes",
};
export default function ProductBrief({
  topicId,
  briefId,
  api,
  onPrepare,
  onError,
}) {
  const [brief, setBrief] = useState(null),
    [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let alive = true;
    setUnavailable(false);
    setBrief(null);
    setDraft(null);
    setEditing(false);
    (briefId
      ? api("admin/briefs/" + briefId)
      : api("admin/topics/" + topicId + "/briefs")
    )
      .then((r) => {
        if (alive) {
          const b = briefId ? r : r[0];
          setBrief(b);
          setDraft(b?.content);
        }
      })
      .catch((e) => {
        if (briefId) setUnavailable(true);
        else onError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [topicId, briefId]);
  async function generate() {
    setBusy(true);
    try {
      const b = await api("admin/briefs/" + topicId + "/generate", {
        method: "POST",
        body: "{}",
      });
      setBrief(b);
      setDraft(b.content);
      setEditing(false);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const b = await api("admin/briefs/" + brief.id, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      setBrief(b);
      setEditing(false);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    setBusy(true);
    try {
      const values = await api("admin/briefs/" + brief.id + "/prepare", {
        method: "POST",
        body: "{}",
      });
      onPrepare(values);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (unavailable)
    return (
      <p className="subtle">
        Le brief source est conservé sur le Mac de son auteur. Le résultat
        attendu et la description de la feature restent partagés.
      </p>
    );
  return (
    <section className="product-brief">
      <div className="product-section-heading">
        <h3>Brief produit</h3>
        <AIProgress scope="brief" />
      </div>
      {!brief ? (
        <p className="subtle">
          Transformer les signaux confirmés en un problème clair, avec ses
          preuves et ses questions ouvertes.
        </p>
      ) : (
        <>
          <p className="subtle">
            {brief.state === "reviewed" ? "Relu" : "Brouillon à relire"} ·{" "}
            {new Date(brief.updated).toLocaleDateString("fr-FR")}
          </p>
          {brief.stale && (
            <p className="impact-warning">
              Les sources ont changé. Régénérez ce brief avant de préparer une
              feature.
            </p>
          )}
          {Object.entries(labels).map(([k, label]) =>
            editing ? (
              <label key={k}>
                {label}
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ) : (
              <div className="brief-paragraph" key={k}>
                <h4>{label}</h4>
                <p>{brief.content[k] || "À préciser"}</p>
              </div>
            ),
          )}
          <details>
            <summary>Preuves · {brief.sources.length}</summary>
            {brief.sources.map((s, i) => (
              <blockquote key={i}>
                <small>
                  {s.kind} · {new Date(s.created).toLocaleDateString("fr-FR")}
                </small>
                <p>« {s.quote} »</p>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Ouvrir la source
                  </a>
                )}
              </blockquote>
            ))}
          </details>
        </>
      )}
      <div className="product-actions">
        {topicId && (
          <button className="button" disabled={busy} onClick={generate}>
            {busy
              ? "Analyse en cours…"
              : brief
                ? "Régénérer"
                : "Préparer avec l’IA locale"}
          </button>
        )}
        {brief && !brief.stale && !editing && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Relire et ajuster
          </button>
        )}
        {editing && (
          <>
            <button className="button" disabled={busy} onClick={save}>
              Enregistrer le brief
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setDraft(brief.content);
                setEditing(false);
              }}
            >
              Annuler
            </button>
          </>
        )}
        {brief && !brief.stale && !editing && onPrepare && (
          <button className="button primary" disabled={busy} onClick={prepare}>
            Valider et préparer une feature
          </button>
        )}
      </div>
    </section>
  );
}
