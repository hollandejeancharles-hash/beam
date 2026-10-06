import AuditLog from "./ui/audit-log";
import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import React, { useState } from "react";
import { DATE_KINDS } from "../../shared/roadmap-impact";
const labels = {
  title: "Titre",
  description: "Description",
  status: "État",
  priority: "Priorité",
  start_date: "Début",
  end_date: "Fin",
  date_kind: "Engagement",
  outcome: "Résultat attendu",
  success_measure: "Mesure",
  success_target: "Cible",
  outcome_result: "Bilan",
  outcome_verdict: "Constat",
  outcome_reviewed_at: "Date du bilan",
  brief_id: "Brief source",
  owner: "Responsable",
  progress: "Avancement",
  quarter: "Horizon",
  visibility: "Visibilité",
  parent_id: "Parent",
  dependency_id: "Dépendance",
  category: "Catégorie",
  type: "Type",
  archived: "Archivage",
  position: "Ordre dans le Gantt",
  kanban_position: "Ordre dans le Kanban",
};
const value = (k, v) =>
  k === "date_kind"
    ? DATE_KINDS[v] || "Date cible"
    : k === "outcome_verdict"
      ? {
          unmeasured: "Pas encore mesuré",
          positive: "Résultat atteint",
          mixed: "Partiellement atteint",
          negative: "Résultat non atteint",
        }[v] || v
      : k === "status"
        ? { planned: "À venir", progress: "En cours", done: "Terminé" }[v] || v
        : (v ?? "Non défini");
export default function ItemGovernance({
  item,
  items,
  api,
  onRefresh,
  onError,
  onOpenNote,
  readOnly,
  mode = "all",
  onIssues,
  historyCollapsed = false,
  historyLabel = "Historique des changements",
}) {
  const [rows, setRows] = useState([]),
    [issues, setIssues] = useState([]),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState(null);
  async function load() {
    try {
      const [h, c] = await Promise.all([
        api(`admin/items/${item.id}/history`),
        api("admin/contradictions"),
      ]);
      setRows((previous) => unchangedData(previous, h));
      const related = c.filter((c) => c.item_id === item.id);
      setIssues((previous) => unchangedData(previous, related));
      onIssues?.(related);
    } catch (e) {
      onError(e.message);
    }
  }
  useVisiblePolling(load, 15000, [item.id]);
  async function revert() {
    setBusy(true);
    try {
      await api("admin/history/undo", {
        method: "POST",
        body: JSON.stringify({ history_id: undo.id }),
      });
      setUndo(null);
      await onRefresh();
      await load();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="item-governance">
      {mode !== "history" && !!issues.length && (
        <section aria-label="Écarts à vérifier">
          <h3>
            Écarts à vérifier <small>{issues.length}</small>
          </h3>
          {issues.map((c) => (
            <article className="governance-issue" key={c.id}>
              <p>{c.reason}</p>
              <details>
                <summary>Voir les sources</summary>
                {c.sources.map((s) => (
                  <blockquote key={s.id}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </blockquote>
                ))}
                {c.note_id && (
                  <button
                    className="text-button"
                    onClick={() => onOpenNote(c.note_id)}
                  >
                    Ouvrir la note
                  </button>
                )}
              </details>
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("admin/contradictions/dismiss", {
                      method: "POST",
                      body: JSON.stringify({ fingerprint: c.fingerprint }),
                    });
                    await load();
                  } catch (e) {
                    onError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Écart examiné · ignorer
              </button>
            </article>
          ))}
        </section>
      )}
      {mode !== "issues" && (
        <details
          className="item-history"
          open={mode === "history" && !historyCollapsed ? true : undefined}
        >
          <summary>
            {historyLabel} <small>{rows.length}</small>
          </summary>
          <p className="subtle">
            Changements observés sur ce Mac. Les modifications de l’équipe
            restent aussi disponibles dans son activité.
          </p>
          <AuditLog key={item.id} items={rows.map(r=>{
            const keys=Object.keys(r.after);
            const scheduling=keys.some(k=>["start_date","end_date","date_kind","position","kanban_position"].includes(k));
            const title=keys.length===1 ? `${labels[keys[0]] || keys[0]} modifié` : scheduling ? "Planification mise à jour" : "Élément mis à jour";
            return { id:r.id, title, at:r.created, actor:r.actor, description:r.reason,
              type:scheduling ? "Planification" : "Modification", status:r.can_undo ? "Annulation possible" : "Conservée", tone:scheduling ? "blue" : "purple",
              searchText:keys.map(k=>labels[k] || k).join(" "),
              content:<dl>{keys.map(k=><div key={k}><dt>{labels[k] || k}</dt><dd><span>{["parent_id","dependency_id"].includes(k) ? items.find(i=>i.id===r.before[k])?.title || "Aucun" : String(value(k,r.before[k]))}</span> → <strong>{["parent_id","dependency_id"].includes(k) ? items.find(i=>i.id===r.after[k])?.title || "Aucun" : String(value(k,r.after[k]))}</strong></dd></div>)}</dl>,
              ...(!readOnly && r.can_undo ? {actionLabel:"Annuler cette modification",onAction:()=>setUndo(r)} : {}),
            };
          })}/>

        </details>
      )}
      {undo && (
        <div
          className="history-undo-confirm"
          role="group"
          aria-label="Confirmer l’annulation"
        >
          <p>
            Rétablir les valeurs précédentes ? Si cette modification faisait
            partie d’un déplacement groupé, ses éléments seront rétablis
            ensemble. Les changements plus récents sur ces valeurs empêchent
            l’annulation.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => setUndo(null)}
          >
            Conserver
          </button>
          <button className="button primary" disabled={busy} onClick={revert}>
            {busy ? "Annulation…" : "Rétablir"}
          </button>
        </div>
      )}
    </div>
  );
}
