import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import React, { useEffect, useState } from "react";
import { BookmarkCheck, Link2, Search, FileText } from "lucide-react";
const kinds = {
  defer: "Report",
  prioritize: "Priorité",
  approve: "Validation",
  reject: "Idée écartée",
  decision: "Autre décision",
};
export default function DecisionMemory({
  api,
  note,
  itemId,
  items,
  onError,
  onChange,
  onOpenNote,
  hideEmptyMessage = false,
  onSummary,
  readOnly = false,
}) {
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false),
    [itemSearch, setItemSearch] = useState(""),
    [draft, setDraft] = useState({
      title: "",
      reason: "",
      kind: "decision",
      item_ids: [],
    });
  useEffect(() => { setOpen(false); setItemSearch(""); setDraft({title:"",reason:"",kind:"decision",item_ids:[]}); }, [note?.id]);
  async function load() {
    try {
      const next = await api("admin/decisions");
      setRows((previous) => unchangedData(previous, next));
    } catch (e) {
      onError?.(e.message);
    }
  }
  useVisiblePolling(load, 15000, [note?.id, itemId], "beam:notes");
  const related = rows.filter((d) =>
    note ? d.note_id === note.id : d.item_ids.includes(itemId),
  );
  const visible = related.filter(
    (d) =>
      d.state === "confirmed" ||
      (d.state === "proposed" && (!note || note.text === d.source_text)) ||
      (history && d.state === "archived"),
  );
  const active = visible.filter((d) => d.state !== "archived");
  const pendingCount = active.filter((d) => d.state === "proposed").length;
  useEffect(() => {
    onSummary?.({ count: active.length, pending: pendingCount });
  }, [active.length, pendingCount, itemId]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("admin/decisions", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          note_id: note.id,
          quote: note.text.slice(0, 3000),
        }),
      });
      setOpen(false);
      setDraft({ title: "", reason: "", kind: "decision", item_ids: [] });
      await load();
      await onChange?.();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(d, state = "archived") {
    setBusy(true);
    try {
      await api("admin/decisions/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ state }),
      });
      await load();
      await onChange?.();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="decision-memory" aria-label="Mémoire des décisions">
      <div className="decision-memory-head">
        <h3><BookmarkCheck size={18}/> Décisions prises</h3>
        {note && (
          <button
            className="text-button"
            disabled={busy || readOnly}
            onClick={() => setOpen(!open)}
          >
            {open ? "Masquer le formulaire" : "Ajouter une décision"}
          </button>
        )}
      </div>
      {!visible.length && !open && !hideEmptyMessage && (
        <p className="assistant-help">
          Gardez une trace des choix faits à partir de cette note : un report,
          une validation ou une priorité.
        </p>
      )}
      {visible.map((d) => (
        <article
          className={"decision-memory-entry decision-" + d.state}
          key={d.id}
        >
          <small>
            {kinds[d.kind]} ·{" "}
            {new Date(d.confirmed || d.created).toLocaleDateString("fr-FR")}
            {d.state === "archived"
              ? " · Archivée"
              : d.state === "proposed"
                ? " · À confirmer"
                : ""}
          </small>
          <h4>{d.title}</h4>
          {d.reason && <p>{d.reason}</p>}
          <div className="decision-memory-links">
            {d.item_ids.map((id) => (
              <span key={id}>
                {items.find((i) => i.id === id)?.title || "Élément supprimé"}
              </span>
            ))}
          </div>
          <details>
            <summary>Voir la note source</summary>
            <blockquote>{d.quote}</blockquote>
            {onOpenNote && (
              <button
                className="text-button"
                onClick={() => onOpenNote(d.note_id)}
              >
                Ouvrir la note source
              </button>
            )}
          </details>
          {d.state === "proposed" && (
            <div className="modal-actions">
              <button
                className="text-button"
                disabled={busy || readOnly}
                onClick={() => archive(d, "dismissed")}
              >
                Ignorer
              </button>
              <button
                className="button primary"
                disabled={busy || readOnly}
                onClick={() => archive(d, "confirmed")}
              >
                Confirmer la décision
              </button>
            </div>
          )}
          {d.state === "confirmed" && (
            <button
              className="text-button"
              disabled={busy || readOnly}
              onClick={() => archive(d)}
            >
              Archiver cette décision
            </button>
          )}
        </article>
      ))}
      {related.some((d) => d.state === "archived") && (
        <button className="text-button" onClick={() => setHistory(!history)}>
          {history ? "Masquer les archives" : "Voir les décisions archivées"}
        </button>
      )}
      {open && (
        <form className="decision-memory-form" onSubmit={save}>
          <div className="decision-form-intro"><span className="decision-form-icon"><BookmarkCheck size={20}/></span><div><h4>Quel choix a été fait ?</h4><p>Enregistrez une décision déjà prise pour en retrouver le contexte plus tard.</p></div></div>
          <fieldset className="decision-draft-fields" disabled={busy || readOnly}>
            <label className="decision-title-field">La décision
              <input required maxLength={160} value={draft.title} placeholder="Ex. Reporter le zoom après la refonte" onChange={e=>setDraft({...draft,title:e.target.value})}/>
            </label>
            <label>Nature du choix
              <select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value})}>{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
            </label>
            <label className="decision-reason-field"><span>Contexte <small>Facultatif</small></span>
              <textarea rows={3} maxLength={1000} value={draft.reason} placeholder="Qu’est-ce qui a motivé ce choix ? Qui l’a validé ?" onChange={e=>setDraft({...draft,reason:e.target.value})}/>
            </label>
          </fieldset>
          <div className="decision-targets">
            <div className="decision-targets-head"><strong><Link2 size={15}/> Éléments concernés</strong><small>{draft.item_ids.length}/8 sélectionnés</small></div>
            <p>Associez ce choix aux éléments de la roadmap qu’il concerne. Vous pouvez laisser cette liste vide.</p>
            <label className="decision-target-search"><Search size={15}/><input aria-label="Rechercher un élément concerné" placeholder="Rechercher une initiative, un projet, une feature…" value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/></label>
            <div className="decision-target-list" role="group" aria-label="Éléments concernés">
              {items.filter(i=>!i.archived && i.title.toLocaleLowerCase("fr").includes(itemSearch.toLocaleLowerCase("fr"))).map(i=><label key={i.id} className={draft.item_ids.includes(i.id) ? "selected" : ""}>
                <input type="checkbox" checked={draft.item_ids.includes(i.id)} disabled={busy || readOnly || (!draft.item_ids.includes(i.id) && draft.item_ids.length>=8)} onChange={e=>setDraft({...draft,item_ids:e.target.checked ? [...draft.item_ids,i.id] : draft.item_ids.filter(id=>id!==i.id)})}/>
                <span>{i.title}</span><small className={`decision-item-type ${i.type}`}>{{initiative:"Initiative",project:"Projet",feature:"Feature",task:"Tâche"}[i.type] || "Élément"}</small>
              </label>)}
              {!items.some(i=>!i.archived && i.title.toLocaleLowerCase("fr").includes(itemSearch.toLocaleLowerCase("fr"))) && <p className="decision-target-empty">Aucun élément correspondant.</p>}
            </div>
          </div>
          <details className="decision-source-preview"><summary><FileText size={15}/> Note à l’origine de la décision</summary><blockquote>{note.text.slice(0,3000)}</blockquote></details>
          <p className="decision-save-hint">La décision sera enregistrée avec cette note. Les dates, les statuts et les priorités de la roadmap restent inchangés.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy || readOnly}
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button className="button primary" disabled={busy || readOnly || !draft.title.trim()}>
              {busy ? "Enregistrement…" : "Enregistrer la décision"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
