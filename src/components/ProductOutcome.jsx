import React, { useEffect, useState } from "react";
import ProductBrief from "./ProductBrief";
const verdicts = {
  unmeasured: "Pas encore mesuré",
  positive: "Résultat atteint",
  mixed: "Partiellement atteint",
  negative: "Résultat non atteint",
};
export default function ProductOutcome({
  item,
  api,
  onRefresh,
  onError,
  onOpenNote,
  readOnly,
  heading = "Pourquoi cet élément ?",
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(item),
    [busy, setBusy] = useState(false),
    [delivery, setDelivery] = useState(null);
  useEffect(() => {
    setDraft(item);
    setEditing(false);
    setDelivery(null);
    if (item.status === "done")
      api("admin/items/" + item.id + "/delivery")
        .then(setDelivery)
        .catch((e) => onError(e.message));
  }, [item.id, item.status]);
  async function save() {
    setBusy(true);
    try {
      await api("admin/items/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({
          ...Object.fromEntries(
            [
              "outcome",
              "success_measure",
              "success_target",
              "outcome_result",
              "outcome_verdict",
            ].map((k) => [
              k,
              draft[k] || (k === "outcome_verdict" ? "unmeasured" : ""),
            ]),
          ),
          outcome_reviewed_at:
            item.status === "done"
              ? new Date().toISOString()
              : item.outcome_reviewed_at,
        }),
      });
      setEditing(false);
      await onRefresh();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-outcome">
      <div className="product-section-heading">
        <h3>{heading}</h3>
        {!readOnly && !editing && (
          <button
            className="text-button"
            onClick={() => {
              setDraft(item);
              setEditing(true);
            }}
          >
            {item.status === "done"
              ? "Renseigner le bilan"
              : "Définir le résultat"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <label>
            Résultat attendu
            <textarea
              rows={2}
              maxLength={4000}
              value={draft.outcome || ""}
              onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
              placeholder="Réduire le temps nécessaire pour publier un contenu…"
            />
          </label>
          <label>
            Comment le vérifier ?
            <input
              maxLength={4000}
              value={draft.success_measure || ""}
              onChange={(e) =>
                setDraft({ ...draft, success_measure: e.target.value })
              }
              placeholder="Temps médian de publication, retours des éditeurs…"
            />
          </label>
          <label>
            Cible souhaitée
            <input
              maxLength={4000}
              value={draft.success_target || ""}
              onChange={(e) =>
                setDraft({ ...draft, success_target: e.target.value })
              }
              placeholder="À définir avec l’équipe"
            />
          </label>
        </>
      ) : (
        <>
          <p>
            {item.outcome ||
              "Quel changement veut-on obtenir pour les utilisateurs ?"}
          </p>
          {(item.success_measure || item.success_target) && (
            <dl className="outcome-measures">
              <div>
                <dt>Mesure</dt>
                <dd>{item.success_measure || "À préciser"}</dd>
              </div>
              <div>
                <dt>Cible</dt>
                <dd>{item.success_target || "À préciser"}</dd>
              </div>
            </dl>
          )}
        </>
      )}
      {item.status === "done" && (
        <details className="delivery-review" open>
          <summary>Après la livraison</summary>
          <p className="subtle">
            Livrer ne signifie pas encore avoir atteint le résultat attendu.
          </p>
          {editing ? (
            <>
              <label>
                Constat
                <select
                  value={draft.outcome_verdict || "unmeasured"}
                  onChange={(e) =>
                    setDraft({ ...draft, outcome_verdict: e.target.value })
                  }
                >
                  {Object.entries(verdicts).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bilan et observations
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={draft.outcome_result || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, outcome_result: e.target.value })
                  }
                  placeholder="Ce que les retours et les mesures nous apprennent…"
                />
              </label>
            </>
          ) : (
            <>
              <strong>
                {verdicts[item.outcome_verdict] || verdicts.unmeasured}
              </strong>
              <p>{item.outcome_result || "Aucun bilan renseigné."}</p>
              {item.outcome_reviewed_at && (
                <small>
                  Revu le{" "}
                  {new Date(item.outcome_reviewed_at).toLocaleDateString(
                    "fr-FR",
                  )}
                </small>
              )}
            </>
          )}
          {delivery && (
            <>
              <h4>Retours associés · {delivery.sources.length}</h4>
              <p className="subtle">
                {delivery.dated
                  ? "Depuis le passage à « Livré » le " +
                    new Date(delivery.since).toLocaleDateString("fr-FR")
                  : "Date de livraison inconnue : toutes les sources associées sont montrées."}{" "}
                Ces sources ne prouvent pas à elles seules le succès de la
                feature.
              </p>
              {delivery.sources.map((s) => (
                <article className="delivery-source" key={s.id}>
                  <small>
                    {s.kind} · {new Date(s.created).toLocaleDateString("fr-FR")}
                  </small>
                  {s.id.startsWith("note:") ? (
                    <button
                      className="text-button"
                      onClick={() => onOpenNote(s.id.slice(5))}
                    >
                      {s.title}
                    </button>
                  ) : (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  )}
                </article>
              ))}
              {!delivery.sources.length && (
                <p className="subtle">
                  Les prochains retours associés apparaîtront ici.
                </p>
              )}
            </>
          )}
        </details>
      )}
      {editing && (
        <div className="product-actions">
          <button className="button primary" disabled={busy} onClick={save}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Annuler
          </button>
        </div>
      )}
      {item.brief_id && (
        <details>
          <summary>Brief à l’origine de cet élément</summary>
          <ProductBrief briefId={item.brief_id} api={api} onError={onError} />
        </details>
      )}
    </section>
  );
}
