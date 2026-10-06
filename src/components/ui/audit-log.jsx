import React, { useState } from "react";
import { Activity, Check, Clock, Plus, Trash2, Pencil, Search, RotateCcw } from "lucide-react";
const icons = { green: Check, amber: Clock, red: Trash2, blue: Pencil, purple: Activity, created: Plus, undo: RotateCcw };
export default function AuditLog({ items, emptyMessage = "Les prochaines modifications apparaîtront ici." }) {
  const [search, setSearch] = useState(""), [actor, setActor] = useState(""), [type, setType] = useState(""), [status, setStatus] = useState("");
  const options = key => [...new Set(items.map(item => item[key]).filter(Boolean))].sort();
  const visible = items.filter(item => (!actor || item.actor === actor) && (!type || item.type === type) && (!status || item.status === status) && [item.title,item.description,item.actor,item.type,item.status,item.searchText].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")));
  const filtered = search || actor || type || status;
  return <div className="beam-audit-log">
    {!!items.length && <div className="audit-filters" aria-label="Filtres de l’historique">
      <label className="audit-search"><Search size={15}/><input aria-label="Rechercher dans l’historique" placeholder="Rechercher un changement…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      {[["Auteur",actor,setActor,options("actor")],["Type",type,setType,options("type")],["État",status,setStatus,options("status")]].filter(([, , , values])=>values.length>1).map(([name,value,set,values])=><select key={name} aria-label={`Filtrer par ${name.toLowerCase()}`} value={value} onChange={e=>set(e.target.value)}><option value="">{name} · Tous</option>{values.map(v=><option key={v}>{v}</option>)}</select>)}
      {filtered && <button className="text-button" onClick={()=>{setSearch("");setActor("");setType("");setStatus("");}}>Effacer les filtres</button>}
    </div>}
    <ol className="audit-timeline" aria-label="Événements de l’historique">
      {visible.map(item=>{const Icon=icons[item.iconKind] || icons[item.tone] || Activity;return <li key={item.id} className={`audit-event audit-${item.tone || "purple"}`}>
        <span className="audit-event-icon" aria-hidden="true"><Icon size={14}/></span>
        <div className="audit-event-body"><div className="audit-event-heading"><strong>{item.title}</strong><time dateTime={item.at}>{item.timestamp || (item.at ? new Date(item.at).toLocaleString("fr-FR",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "Date inconnue")}</time></div>
          {item.description && <p className="audit-event-description">{item.description}</p>}
          <div className="audit-event-meta">{item.actor && <span className="audit-actor">{item.actor}</span>}{item.type && <span className="audit-badge">{item.type}</span>}{item.status && <span className="audit-badge audit-state">{item.status}</span>}</div>
          {item.content && <div className="audit-event-content">{item.content}</div>}
          {item.onAction && <button className="text-button audit-event-action" onClick={item.onAction}>{item.actionLabel}</button>}
        </div>
      </li>})}
      {!visible.length && <li className="audit-empty" role="status">{filtered ? "Aucun événement ne correspond à ces filtres." : emptyMessage}</li>}
    </ol>
  </div>;
}
