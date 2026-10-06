import React, {useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
export default function QuickItemActions({item,onChange,onCreate}) {
 const [busy,setBusy]=useState(false);
 const [open,setOpen]=useState(false);
 const [position,setPosition]=useState({left:0,top:0});
 const trigger=useRef(null);
 const popup=useRef(null);
 function close(){if(trigger.current) trigger.current.open=false;setOpen(false);}
 useLayoutEffect(()=>{
  if(!open) return;
  const anchor=trigger.current.getBoundingClientRect();
  const bounds=popup.current.getBoundingClientRect();
  setPosition({left:Math.max(8,Math.min(anchor.right-bounds.width,window.innerWidth-bounds.width-8)),top:Math.max(8,Math.min(anchor.bottom+6,window.innerHeight-bounds.height-8))});
  function outside(event){if(!trigger.current?.contains(event.target)&&!popup.current?.contains(event.target)) close();}
  function escape(event){if(event.key==='Escape'){close();trigger.current?.querySelector('summary')?.focus();}}
  function scroll(event){if(!popup.current?.contains(event.target))close();}
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  document.addEventListener('scroll',scroll,true);
  window.addEventListener('resize',close);
  return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',close);};
 },[open]);
 async function change(body) {setBusy(true);try{await onChange(item,body);}finally{setBusy(false);}}
 const stop=e=>{e.stopPropagation();if(e.type==='keydown'&&e.key==='Escape'){close();trigger.current?.querySelector('summary')?.focus();}};
 return <details ref={trigger} className="quick-item-actions" onToggle={e=>setOpen(e.currentTarget.open)} onKeyDown={stop} onClick={stop} onPointerDown={stop}>
 <summary aria-label={`Actions rapides · ${item.title}`} aria-expanded={open}>⋯</summary>
 {open && createPortal(<div ref={popup} className="quick-item-popover" style={position} role="dialog" aria-label={`Actions rapides · ${item.title}`} onClick={stop} onPointerDown={stop} onKeyDown={stop}>
 {onCreate && <button onClick={()=>{close();onCreate(item);}}>+ Créer sous cet élément</button>}
 <label>Statut<select disabled={busy} value={item.status} onChange={e=>change({status:e.target.value})}><option value="planned">À venir</option><option value="progress">En cours</option><option value="done">Livré</option></select></label>
 <label>Priorité<select disabled={busy} value={item.priority} onChange={e=>change({priority:e.target.value})}><option value="low">Basse</option><option value="medium">Normale</option><option value="high">Haute</option></select></label>
 <form onSubmit={e=>{e.preventDefault();change({owner:new FormData(e.currentTarget).get('owner')});}}><label>Responsable<input name="owner" defaultValue={item.owner || ''} key={item.owner}/></label><button disabled={busy}>Enregistrer</button></form>
 </div>,document.body)}</details>;
}
