import React, { useState } from "react";
import { ArrowRight } from "../icons";
export default function PlanningImpact({
  plan,
  busy,
  onCascade,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="planning-impact">
      <p className="impact-intro">
        Vérifiez ce que ce changement implique avant de l’appliquer.
      </p>
      <h3>{plan.item.title}</h3>
      <div className="impact-period">
        <span>
          {plan.item.start_date || "Sans date"} →{" "}
          {plan.item.end_date || "Sans date"}
        </span>
        <ArrowRight size={16} />
        <strong>
          {plan.next.start_date || "Sans date"} →{" "}
          {plan.next.end_date || "Sans date"}
        </strong>
      </div>
      {plan.item.date_kind === "committed" && (
        <p className="impact-warning">
          Vous modifiez un engagement confirmé. Prévenez les personnes
          concernées.
        </p>
      )}
      <section>
        <h4>Éléments enfants · {plan.children.length}</h4>
        {plan.canShift &&
          plan.children.some(
            (c) => c.start_date && c.end_date && c.status !== "done",
          ) && (
            <label className="impact-cascade">
              <input
                type="checkbox"
                checked={plan.cascade}
                disabled={busy}
                onChange={(e) => onCascade(e.target.checked)}
              />
              Décaler aussi les enfants datés non terminés
            </label>
          )}
        {!plan.children.length ? (
          <p className="subtle">Aucun enfant.</p>
        ) : (
          <ul>
            {plan.children.map((c) => (
              <li key={c.id}>
                <span>{c.title}</span>
                <small className={c.outside_parent ? "impact-warning" : ""}>
                  {c.outside_parent
                    ? "Sort de la période du parent"
                    : c.shifted
                      ? "Décalé avec le parent"
                      : c.status === "done"
                        ? "Déjà terminé · conservé"
                        : "Dates conservées"}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>Dépendances · {plan.dependencies.length}</h4>
        {!plan.dependencies.length ? (
          <p className="subtle">Aucune dépendance concernée.</p>
        ) : (
          <ul>
            {plan.dependencies.map((d) => (
              <li key={d.id}>
                <span>{d.title}</span>
                <small className={d.conflict ? "impact-warning" : ""}>
                  {d.conflict
                    ? "Commence avant la fin de " + d.dependency_title
                    : "À vérifier · dates conservées"}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>Publications liées · {plan.publications.length}</h4>
        {!plan.publications.length ? (
          <p className="subtle">Aucune publication liée.</p>
        ) : (
          <ul>
            {plan.publications.map((p) => (
              <li key={p.id}>
                <span>{p.title}</span>
                <small>
                  {p.state === "published" ? "Déjà publiée" : "Brouillon"} ·
                  contenu conservé
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <label className="impact-reason">
        Pourquoi ce changement ? <span className="subtle">Facultatif</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Un arbitrage, une dépendance, un retour client…"
        />
      </label>
      <div className="modal-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Annuler
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onConfirm(reason)}
        >
          {busy ? "Enregistrement…" : "Appliquer la replanification"}
        </button>
      </div>
    </div>
  );
}
