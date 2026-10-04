import React, { useState } from "react";
import { DAY, dateValue, isoDate } from "../../shared/planning";
const priorityLabels = { high: "Haute", medium: "Normale", low: "Basse" };
export default function RoadmapScenario({
  items,
  api,
  onRefresh,
  onError,
  onClose,
}) {
  const [entries, setEntries] = useState({}),
    [cascade, setCascade] = useState(false),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const available = items.filter((i) => !i.archived && i.status !== "done");
  const set = (id, patch) => {
    setPreview(null);
    setEntries({ ...entries, [id]: { ...entries[id], ...patch } });
  };
  function rows() {
    return available
      .filter((i) => entries[i.id]?.selected)
      .map((i) => {
        const e = entries[i.id],
          days = Number(e.days || 0),
          patch = {};
        if (!Number.isInteger(days) || Math.abs(days) > 3650)
          throw Error(
            "Le décalage doit être un nombre entier entre −3650 et 3650 jours.",
          );
        if (days) {
          if (!i.start_date || !i.end_date)
            throw Error(
              "Définissez des dates précises pour déplacer " + i.title,
            );
          patch.start_date = isoDate(dateValue(i.start_date) + days * DAY);
          patch.end_date = isoDate(dateValue(i.end_date) + days * DAY);
          patch.quarter = `T${Math.floor((Number(patch.start_date.slice(5, 7)) - 1) / 3) + 1} ${patch.start_date.slice(0, 4)}`;
        }
        if (e.priority && e.priority !== i.priority)
          patch.priority = e.priority;
        if (!Object.keys(patch).length)
          throw Error("Ajustez les dates ou la priorité de " + i.title);
        return { id: i.id, patch };
      });
  }
  async function compare() {
    setBusy(true);
    try {
      const next = rows();
      setPreview({
        ...(await api("admin/scenarios/preview", {
          method: "POST",
          body: JSON.stringify({ rows: next, cascade }),
        })),
        rows: next,
      });
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    try {
      await api("admin/scenarios/apply", {
        method: "POST",
        body: JSON.stringify({
          rows: preview.rows,
          cascade,
          token: preview.token,
          reason,
        }),
      });
      await onRefresh();
      onClose();
      onError("Scénario appliqué · annulation disponible dans l’historique");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="roadmap-scenario">
      <p className="impact-intro">
        Explorez une autre organisation de la roadmap. Rien ne change tant que
        vous n’appliquez pas le scénario.
      </p>
      {available.length ? (
        <>
          <h3>Éléments à ajuster</h3>
          {available.map((i) => (
            <article className="scenario-entry" key={i.id}>
              <label className="scenario-select">
                <input
                  type="checkbox"
                  checked={!!entries[i.id]?.selected}
                  disabled={busy}
                  onChange={(e) => set(i.id, { selected: e.target.checked })}
                />
                <span>
                  {i.title}
                  <small>
                    {i.type === "initiative"
                      ? "Initiative"
                      : i.type === "project"
                        ? "Projet"
                        : "Feature"}{" "}
                    ·{" "}
                    {i.date_kind === "committed"
                      ? "Engagement confirmé"
                      : "Date cible"}
                  </small>
                </span>
              </label>
              {entries[i.id]?.selected && (
                <div className="scenario-controls">
                  <label>
                    Décalage en jours
                    <input
                      type="number"
                      min={-3650}
                      max={3650}
                      value={entries[i.id]?.days || 0}
                      disabled={busy}
                      onChange={(e) => set(i.id, { days: e.target.value })}
                    />
                  </label>
                  <label>
                    Priorité
                    <select
                      value={entries[i.id]?.priority || i.priority}
                      disabled={busy}
                      onChange={(e) => set(i.id, { priority: e.target.value })}
                    >
                      {Object.entries(priorityLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </article>
          ))}
          <label className="scenario-select">
            <input
              type="checkbox"
              checked={cascade}
              disabled={busy}
              onChange={(e) => {
                setCascade(e.target.checked);
                setPreview(null);
              }}
            />
            Décaler aussi les enfants datés non terminés
          </label>
          <button className="button" disabled={busy} onClick={compare}>
            {busy ? "Comparaison…" : "Comparer avec la roadmap actuelle"}
          </button>
        </>
      ) : (
        <p className="subtle">
          Ajoutez un élément à la roadmap pour explorer un scénario.
        </p>
      )}
      {preview && (
        <section className="scenario-comparison">
          <h3>Avant / après · {preview.changes.length} éléments</h3>
          {preview.comparisons.map(({ before, after }) => (
            <article key={before.id}>
              <h4>{before.title}</h4>
              {before.date_kind === "committed" && (
                <p className="impact-warning">
                  Cet élément porte un engagement confirmé.
                </p>
              )}
              <dl>
                <div>
                  <dt>Actuel</dt>
                  <dd>
                    {before.start_date || "Sans dates"} →{" "}
                    {before.end_date || before.quarter} ·{" "}
                    {priorityLabels[before.priority]}
                  </dd>
                </div>
                <div>
                  <dt>Scénario</dt>
                  <dd>
                    {after.start_date || "Sans dates"} →{" "}
                    {after.end_date || after.quarter} ·{" "}
                    {priorityLabels[after.priority]}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          <h4>Dépendances à vérifier · {preview.dependencies.length}</h4>
          {preview.dependencies.map((d) => (
            <p className={d.conflict ? "impact-warning" : "subtle"} key={d.id}>
              {d.title} ·{" "}
              {d.conflict
                ? "Commence avant la fin de " + d.dependency_title
                : "Dates conservées"}
            </p>
          ))}
          <h4>Publications concernées · {preview.publications.length}</h4>
          {preview.publications.map((p) => (
            <p className="subtle" key={p.id}>
              {p.title} · contenu conservé
            </p>
          ))}
          <p className="subtle">
            Les dépendances et publications ne seront pas modifiées
            automatiquement.
          </p>
          <label>
            Pourquoi ce scénario ?
            <textarea
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="product-actions">
            <button className="button primary" disabled={busy} onClick={apply}>
              {busy ? "Application…" : "Appliquer ce scénario"}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Revoir le scénario
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
