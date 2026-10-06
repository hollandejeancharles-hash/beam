import {readViewCache, writeViewCache} from "../../shared/view-cache";
import useViewPosition from "../hooks/useViewPosition";
import { Folder, BookmarkCheck, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { createPortal } from "react-dom";
import { notebookFolders } from "../../shared/notebook-folders";
import { loadNotebook } from "../../shared/notebook-load";
import NoteImage, { DraftImages } from "./NoteImage";
import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import NoteConversion from "./NoteConversion";
import {conversionContext} from "../../shared/notebook-context";
import { receiveNoteTransfer } from "../../shared/note-transfer";
import { usePersistentDraft } from "../usePersistentDraft";
import ProductBrief from "./ProductBrief";
import DecisionMemory from "./DecisionMemory";
import ReviewInbox from "./ReviewInbox";
import { includesSearch } from "../../shared/search";
import AIProgress, {AIActivityProvider} from "./AIProgress";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
// Retain the last successful local read when navigating away and back.
const notebookCache = readViewCache("personal-notebook", localStorage) || {notes:null,catalog:[]};
const notebookNavigation = (()=>{try{return JSON.parse(sessionStorage.getItem('beam:notebook-navigation')) || {};}catch{return {};}})();
const richEditorModule = import("./RichNoteEditor");
const LazyRichNoteEditor = lazy(() => richEditorModule);
function RichNoteEditor(props) {
  return (
    <Suspense fallback={<p className="notebook-hint">Ouverture de la note…</p>}>
      <LazyRichNoteEditor {...props} />
    </Suspense>
  );
}
import {
  MorphingPopover,
  MorphingPopoverTrigger,
  MorphingPopoverContent,
} from "./ui/morphing-popover";
import {
  Plus,
  FileText,
  Close,
  CheckCheck,
  Search,
  ArrowRight,
  Activity,
} from "../icons";
import LocalAssistant from "./LocalAssistant";
import { interpretNote, NOTE_KINDS } from "../../shared/notes";
const dateLabel = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
export function useDraft(workspaceId) {
  const legacyKey = "beam_note_draft:" + (workspaceId || new URLSearchParams(location.search).get("workspace") || "default");
  const key = "beam_note_draft:personal";
  const [entry, setEntry] = useState(() => ({
    key,
    text: localStorage.getItem(key) || localStorage.getItem(legacyKey) || "",
  }));
  const text = entry.key === key ? entry.text : localStorage.getItem(key) || "";
  useEffect(() => {
    if (entry.key !== key) {
      setEntry({ key, text });
      return;
    }
    localStorage.setItem(key, text);
  }, [key, text, entry.key]);
  useEffect(() => {
    const sync = (e) => {
      if (e.key === key) setEntry({ key, text: e.newValue || "" });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const setText = (value) =>
    setEntry((previous) => ({
      key,
      text:
        typeof value === "function"
          ? value(previous.key === key ? previous.text : text)
          : value,
    }));
  return [text, setText];
}
export function QuickNote({ api, items, onError }) {
  const [open, setOpen] = useState(false),
    [text, setText] = useDraft(),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const input = useRef(null),
    trigger = useRef(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    const h = (e) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        if (!document.querySelector("[role=dialog]")) setOpen(true);
      }
    };
    // Native menu-bar capture: reuse the current screen and preserve any draft.
    const capture = ({ fromSearch = false } = {}) => {
      const otherDialog = document.querySelector(
        '[role="dialog"]:not([aria-label="Capture rapide"])',
      );
      if (
        otherDialog &&
        !(fromSearch && otherDialog.classList.contains("command-dialog"))
      )
        return false;
      setOpen(true);
      requestAnimationFrame(() => input.current?.focus());
      return true;
    };
    window.__beamCaptureNote = capture;
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      if (window.__beamCaptureNote === capture) delete window.__beamCaptureNote;
    };
  }, []);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  async function save(e) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await api("admin/notes", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      setSaved(true);
      window.dispatchEvent(new Event("beam:notes"));
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }
  const info = interpretNote(text, items);
  return (
    <MorphingPopover
      className="quick-note"
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : close())}
    >
      <MorphingPopoverTrigger
        className="button"
        ref={trigger}
        title="⌘⇧N / Ctrl⇧N"
      >
        <Plus size={14} /> Noter
      </MorphingPopoverTrigger>
      <MorphingPopoverContent
        className="note-capture"
        aria-label="Capture rapide"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const controls = [
              ...e.currentTarget.querySelectorAll(
                "button:not(:disabled),textarea",
              ),
            ];
            if (e.shiftKey && document.activeElement === controls[0]) {
              e.preventDefault();
              controls.at(-1).focus();
            } else if (
              !e.shiftKey &&
              document.activeElement === controls.at(-1)
            ) {
              e.preventDefault();
              controls[0].focus();
            }
          }
        }}
      >
        <form onSubmit={save}>
          <div className="note-capture-head">
            <strong>Une pensée, un échange, une suite.</strong>
            <button
              type="button"
              className="icon-button"
              aria-label="Fermer la capture"
              onClick={close}
            >
              <Close size={16} />
            </button>
          </div>
          <textarea
            ref={input}
            disabled={busy}
            aria-label="Votre note"
            placeholder="Relancer Sarah demain sur la prévisualisation…"
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save(e);
            }}
          />
          <div className="note-hints">
            {text.trim() ? (
              <>
                <span>{NOTE_KINDS[info.kind]}</span>
                {info.people.map((p) => (
                  <span key={p}>@{p}</span>
                ))}
                {info.tags.map((t) => (
                  <span key={"tag:" + t}>#{t}</span>
                ))}
                {info.due && <span>{dateLabel(info.due)}</span>}
                {info.linked.map((id) => (
                  <span key={id}>{items.find((i) => i.id === id)?.title}</span>
                ))}
              </>
            ) : (
              <small>
                Écrivez librement. @personne et #sujet sont aussi reconnus.
              </small>
            )}
          </div>
          <div className="note-capture-foot">
            <small role="status">
              {saved
                ? "Note enregistrée ✓"
                : "Brouillon conservé · ⌘↵ pour enregistrer"}
            </small>
            <button className="button primary" disabled={!text.trim() || busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </MorphingPopoverContent>
    </MorphingPopover>
  );
}
export default function Notes({
  api,
  initialTarget,
  onTargetConsumed,
  items,
  onError,
  onOpen,
  onRefresh,
  onPrepare,
  onInboxCount,
  onCaptureDraft,
  onFocusMode,
}) {
  const workspaceId =
    new URLSearchParams(location.search).get("workspace") || "default";
  const [conversion,setConversion]=useState(null);
  const [conversionResult,setConversionResult]=useState(null);
  const [catalog,setCatalog]=useState(notebookCache.catalog),[workspaceFolder,setWorkspaceFolder]=useState(null);

  const notebookApi=(path,options={})=>{
    if(path==='admin/ai/activity')return api('admin/notebook/activity',options);
    if(path==='admin/ai/reviews' && !options.method)return api('admin/notebook/reviews',options);
    if(path==='admin/inbox')return api('admin/notebook/inbox',options);
    if(path.startsWith('admin/topics'))return api(path.replace('admin/topics','admin/notebook/topics'),options);
    const reviewId=path.match(/^admin\/ai\/reviews\/([^/]+)/)?.[1];
    let target=data.reviews.find(r=>r.id===reviewId)?.workspace_id;
    if(path==='admin/ai/analyze' && options.body){const input=JSON.parse(options.body);const note=notes.find(n=>n.id===input.id);if(input.scope==='note'&&note)target=conversionContext(note,catalog,workspaceId,'task').workspaceId;}
    return api(path,{...options,...(target?{headers:{...options.headers,'X-Beam-Workspace':target}}:{})});
  };
  function openReference(ref) {
    if(!ref.workspace_id)return;
    const target=catalog.find(w=>w.id===ref.workspace_id)?.items.find(i=>i.id===ref.item_id);
    if(ref.workspace_id===workspaceId && target)onOpen?.(target);
    else if(target){const url=new URL(location.href);url.searchParams.set('workspace',ref.workspace_id);url.hash='element-'+target.id;location.assign(url.href);}else {setWorkspaceFolder(ref.workspace_id);setFolder(null);setView('all');}
  }
  function convert(type,n,excerpt) {setConversion({type,note:{...n,...(excerpt?{excerpt}:{})}});}

  const notebookRoot = useViewPosition("personal-notebook");
  const loadingNotebook = useRef(null);
  const [focusNote, setFocusNote] = useState(false);
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const decisionsDialog = useRef(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const insightsDialog = useRef(null);
  useEffect(() => { if (insightsOpen) insightsDialog.current?.showModal(); }, [insightsOpen]);
  useEffect(() => {
    if (decisionsOpen) decisionsDialog.current?.showModal();
  }, [decisionsOpen]);
  useEffect(() => {onFocusMode?.(focusNote); return () => onFocusMode?.(false);}, [focusNote,onFocusMode]);
  const [paneWidths, setPaneWidths] = useState(() => {
    try { const saved=JSON.parse(localStorage.getItem("beam_note_columns")); return {index:Math.max(140,Math.min(360,Number(saved?.index)||185)),list:Math.max(200,Math.min(520,Number(saved?.list)||265))}; } catch { return {index:185,list:265}; }
  });
  useEffect(() => { localStorage.setItem("beam_note_columns",JSON.stringify(paneWidths)); }, [paneWidths]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width=entry.contentRect.width;
      if(width < 660 || focusNote) return;
      setPaneWidths((old)=>{
        const index=Math.min(old.index,Math.max(140,width-520));
        const list=Math.min(old.list,Math.max(200,width-index-320));
        return index===old.index && list===old.list ? old : {index,list};
      });
    });
    if(notebookRoot.current) observer.observe(notebookRoot.current);
    return ()=>observer.disconnect();
  }, [focusNote]);
  function resizePane(e, pane) {
    const separator=e.currentTarget, root=separator.parentElement, start=e.clientX, original=paneWidths[pane];
    separator.setPointerCapture(e.pointerId);
    const move=(event) => {
      const other=paneWidths[pane === "index" ? "list" : "index"];
      const max=Math.max(pane === "index" ? 140 : 200, Math.min(pane === "index" ? 360 : 520,root.clientWidth-other-320));
      setPaneWidths((value)=>({...value,[pane]:Math.max(pane === "index" ? 140 : 200,Math.min(max,original+event.clientX-start))}));
    };
    const stop=()=>{separator.removeEventListener("pointermove",move);separator.removeEventListener("pointerup",stop);separator.removeEventListener("pointercancel",stop);};
    separator.addEventListener("pointermove",move);separator.addEventListener("pointerup",stop);separator.addEventListener("pointercancel",stop);
  }
  function columnSeparator(pane, label) {
    return <div className={`notebook-resizer resizer-${pane}`} role="separator" aria-label={label} aria-orientation="vertical" tabIndex={0} aria-valuemin={pane === "index" ? 140 : 200} aria-valuemax={pane === "index" ? 360 : 520} aria-valuenow={paneWidths[pane]} onPointerDown={(e)=>resizePane(e,pane)} onDoubleClick={()=>setPaneWidths({index:185,list:265})} onKeyDown={(e)=>{if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();setPaneWidths((value)=>({...value,[pane]:Math.max(pane === "index" ? 140 : 200,Math.min(pane === "index" ? 360 : 520,value[pane]+(e.key === "ArrowLeft" ? -20 : 20)))}));}}} />;
  }

  const [composerKey, setComposerKey] = useState(
    () =>
      sessionStorage.getItem("beam-capture-composer:" + workspaceId) ||
      "note-composer",
  );
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [richDraft, setRichDraft] = usePersistentDraft(
    composerKey + ":document",
    null,
    true,
  );
  const [notes, setNotes] = useState(notebookCache.notes || []),
    [text, setText] = usePersistentDraft(composerKey, "", true),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [view, setView] = useState(notebookNavigation.view || "all"),
    [topic, setTopic] = useState("Tous"),
    [folder, setFolder] = useState(notebookNavigation.folder || null),
    [showHiddenFolders, setShowHiddenFolders] = useState(false),
    [query, setQuery] = useState(notebookNavigation.query || ""),
    [selected, setSelected] = useState(notebookNavigation.selected || null),
    [subjects, setSubjects] = useState(notebookCache.subjects || { topics: [], unassigned: [] }),
    [subject, setSubject] = useState(null),
    [settings, setSettings] = useState(false),
    [data, setData] = useState(notebookCache.data || { status: null, reviews: [] }),
    [classification, setClassification] = useState(null);
  const [composing, setComposing] = useState(
    () => composerKey !== "note-composer" && !initialTarget,
  );
  useEffect(() => { setDecisionsOpen(false); setInsightsOpen(false); }, [selected?.id, composing, subject, settings]);
  useEffect(() => { Object.assign(notebookNavigation,{view,folder,selected:selected ? {id:selected.id} : null,query}); try{sessionStorage.setItem('beam:notebook-navigation',JSON.stringify(notebookNavigation));}catch{} }, [view,folder,selected,query]);
  const composer = useRef(null);
  useEffect(() => {
    onCaptureDraft?.({ text, document: richDraft, composing, hasFiles: files.length > 0, busy });
  }, [text, richDraft, composing, files.length, busy, onCaptureDraft]);
  useEffect(() => {
    if (composerKey === "note-composer") return;
    const marker = "beam-capture-composer:" + workspaceId;
    if (text.trim() || files.length)
      sessionStorage.setItem(marker, composerKey);
    else sessionStorage.removeItem(marker);
  }, [composerKey, text, files.length]);
  useEffect(() => {
    if (!files.length) return;
    const protect = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [files.length]);
  const [inbox, setInbox] = useState([]);
  const [loaded, setLoaded] = useState(notebookCache.notes !== null);
  const [loadError,setLoadError]=useState("");
  useEffect(() => {
    if (initialTarget?.kind !== "capture") return;
    try {
      const slot = receiveNoteTransfer({
        local: localStorage,
        session: sessionStorage,
        workspaceId,
        transferId: initialTarget.id,
      });
      setComposerKey(slot);
      setComposing(true);
      setSelected(null);
      setSubject(null);
      setView("all");
      setQuery("");
      setTopic("Tous");
      onTargetConsumed?.();
      requestAnimationFrame(() => composer.current?.focus());
    } catch (e) {
      onError(e.message);
      onTargetConsumed?.();
    }
  }, [initialTarget]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function load() {
    if (loadingNotebook.current) return loadingNotebook.current;
    loadingNotebook.current = fetchNotebook().finally(() => { loadingNotebook.current = null; });
    return loadingNotebook.current;
  }
  async function fetchNotebook() {
    void api('admin/notebook/catalog').then(value=>{if(mounted.current){notebookCache.catalog=value;writeViewCache("personal-notebook",notebookCache,localStorage);setCatalog(previous=>unchangedData(previous,value));}}).catch(()=>{});
    await loadNotebook(
      notebookApi,
      (section, value) => {
        if (!mounted.current) return;
        if (section === "notes") {
          setLoadError("");
          notebookCache.notes=value;
          writeViewCache("personal-notebook",notebookCache,localStorage);
          setNotes((previous) => unchangedData(previous, value));
          setLoaded(true);
        }
        if (section === "inbox") {
          setInbox((previous) => unchangedData(previous, value));
          onInboxCount?.(value.length);
        }
        if (section === "subjects") {
          notebookCache.subjects=value;
          writeViewCache("personal-notebook",notebookCache,localStorage);
          setSubjects((previous) => unchangedData(previous, value));
          setSubject((previous) =>
            previous
              ? unchangedData(
                  previous,
                  value.topics.find((t) => t.id === previous.id) || null,
                )
              : null,
          );
        }
        if (section === "status" || section === "reviews") {
          notebookCache.data={...(notebookCache.data || {status:null,reviews:[]}),[section]:value};
          writeViewCache("personal-notebook",notebookCache,localStorage);
          setData((previous) =>
            unchangedData(previous, { ...previous, [section]: value }),
          );
        }
      },
      (error, section) => {
        if (mounted.current && section === "notes") {setLoadError(error.message); onError(error.message);}
      },
    );
  }
  useVisiblePolling(
    load,
    data.reviews.some((r) => ["queued", "running"].includes(r.state))
      ? 4000
      : 30000,
    [],
    "beam:notes",
  );
  useEffect(() => {
    if (!initialTarget || (!loaded && initialTarget.kind !== "settings"))
      return;
    if (initialTarget.kind === "review") {
      setView("review");
      setSelected(null);
      setComposing(false);
      setSubject(null);
    } else if (initialTarget.kind === "settings") setSettings(true);
    else if (initialTarget.kind === "topic") {
      const found = subjects.topics.find((t) => t.id === initialTarget.id);
      if (found) setSubject(found);
      else onError("Ce sujet n’est plus disponible.");
    } else if (
      ["note", "attachment", "decision"].includes(initialTarget.kind)
    ) {
      const found = notes.find(
        (n) => n.id === (initialTarget.targetId || initialTarget.id),
      );
      if (found) {
        setComposing(false);
        setSelected(found);
        if(initialTarget.commandType) convert(initialTarget.commandType, found);
        setView(found.state === "archived" ? "archives" : "all");
        setQuery("");
        setTopic("Tous");
      } else onError("Cette note n’est plus disponible.");
    } else return;
    onTargetConsumed?.();
  }, [initialTarget, loaded, notes, subjects]);
  const latest = new Map();
  for (const r of data.reviews)
    if (r.scope === "note" && !latest.has(r.entity_id))
      latest.set(r.entity_id, r);
  const pending = (n) =>
    inbox.some(
      (row) =>
        row.note_id === n.id ||
        (row.scope === "note" && row.entity_id === n.id),
    );
  const viewCounts = {
    all: notes.filter(n=>!['archived','deleted'].includes(n.state)).length,
    followup: notes.filter(n=>n.state==='open' && ['action','followup'].includes(n.kind)).length,
    review: inbox.length,
    archives: notes.filter(n=>n.state==='archived').length,
    trash: notes.filter(n=>n.state==='deleted').length,
  };
  const current = notes.find((n) => n.id === selected?.id) || null;
  const topics = [
    ...new Set(
      notes.filter((n) => !["archived","deleted"].includes(n.state)).flatMap((n) => n.tags),
    ),
  ];
  const folders = notebookFolders(subjects.topics);
  const activeFolder = folders.find((t) => t.id === folder);
  const visible = notes.filter(
    (n) =>
      (view === "trash" ? n.state === "deleted" : view === "archives" ? n.state === "archived" : !["archived","deleted"].includes(n.state)) &&
      (view !== "followup" ||
        (n.state === "open" && ["action", "followup"].includes(n.kind))) &&
      (view !== "review" || pending(n)) &&
      (topic === "Tous" || n.tags.includes(topic)) &&
      (!activeFolder || activeFolder.noteIds.includes(n.id)) &&
      (!workspaceFolder || n.workspace_ids?.includes(workspaceFolder)) &&
      (!query ||
        includesSearch(query, [
          n.text,
          ...n.people,
          ...n.tags,
          ...(n.attachments || []).map((a) => a.name),
        ])),
  );
  useEffect(() => {
    if (!loaded || composing || subject || view === "review") return;
    if (!visible.some((n) => n.id === selected?.id))
      setSelected(
        window.matchMedia("(min-width: 701px)").matches
          ? visible[0] || null
          : null,
      );
  }, [loaded, notes, view, topic, query, composing, subject, folder, subjects,workspaceFolder]);
  function newNote() {
    setFolder(null);
    setTopic("Tous");
    setComposing(true);
    setSelected(null);
    setSubject(null);
    setView("all");
    setQuery("");
    setTopic("Tous");
    setSettings(false);
    requestAnimationFrame(() => composer.current?.focus());
  }
  async function attach(id, chosen) {
    for (const file of chosen) {
      if (file.size > 8 * 1024 * 1024) throw Error("8 Mo maximum par fichier");
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api(`admin/notes/${id}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          mime: file.type,
          data: base64,
        }),
      });
    }
  }
  async function save(e, snapshot, commandType) {
    e?.preventDefault();
    const value=snapshot?.text ?? text, doc=snapshot?.document ?? richDraft;
    if (busy || (!value.trim() && !files.length)) return;
    setBusy(true);
    try {
      const n = await api("admin/notes", {
        method: "POST",
        body: JSON.stringify({
          text: value.trim() || files.map((f) => f.name).join(", "),
          ...(value.trim() && doc ? { document: doc } : {}),
          workspace_ids:workspaceFolder ? [workspaceFolder] : [],
        }),
      });
      setText("");
      setRichDraft(null);
      const chosen = files;
      setFiles([]);
      await attach(n.id, chosen);
      await load();
      setSelected(n);
      setComposing(false);
      sessionStorage.removeItem("beam-capture-composer:" + workspaceId);
      setComposerKey("note-composer");
      if(commandType) convert(commandType,n);
      return n;
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function removeWorkspace(n,id) {
    const strip=node=>node.type==='mention' && node.attrs.workspace_id===id ? {type:'text',text:'@'+node.attrs.label} : {...node,...(node.content?{content:node.content.map(strip)}:{})};
    const remaining=(n.references || []).filter(r=>r.workspace_id!==id);
    return update(n,{workspace_ids:n.workspace_ids.filter(w=>w!==id),references:remaining,...(n.document?{document:strip(n.document)}:{}),classification:{linked:(n.linked || []).filter(item=>!catalog.find(w=>w.id===id)?.items.some(i=>i.id===item))}});
  }
  async function update(n, body) {
    try {
      const saved = await api(`admin/notes/${n.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setNotes(previous => {
        const next = previous.map(note => note.id === n.id ? saved : note);
        notebookCache.notes = next;
        writeViewCache("personal-notebook", notebookCache, localStorage);
        return next;
      });
      return true;
    } catch (e) {
      onError(e.message);
      return false;
    }
  }
  async function download(a) {
    try {
      const response = await fetch(`/api/admin/attachments/${a.id}`, {
        headers: {
          Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
          "X-Beam-Workspace":
            new URLSearchParams(location.search).get("workspace") || "default",
        },
      });
      if (!response.ok) throw Error("Impossible d’ouvrir le fichier");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <AIActivityProvider api={notebookApi} enabled className="notebook-personal-activity">
    <div
      ref={notebookRoot}
      style={{"--note-index-width":`${paneWidths.index}px`,"--note-list-width":`${paneWidths.list}px`}}
      className={`notes-notebook ${focusNote ? "note-focus" : ""} ${composing || current || subject || settings || view === "review" ? "has-detail" : ""}`}
    >
      {conversion && <NoteConversion key={conversion.note.id+conversion.type} {...conversion} catalog={catalog} active={workspaceId} api={api} onClose={()=>setConversion(null)} onError={onError} onDone={result=>{void load();onRefresh?.();setConversionResult(result);}} />}
      {conversionResult && <div className="note-conversion-result" role="status">
        <strong>{conversionResult.type === 'demand' ? 'Demande' : conversionResult.type === 'task' ? 'Tâche' : 'Feature'} créée</strong>
        <span>{catalog.find(w=>w.id===conversionResult.workspace)?.name || 'Workspace'}{conversionResult.parentTitle ? ` · ${conversionResult.parentTitle}` : ''} · Votre note est conservée.</span>
        <a className="button" href={`?workspace=${encodeURIComponent(conversionResult.workspace)}#${conversionResult.type === 'demand' ? 'feedback' : 'gantt'}`}>Ouvrir {conversionResult.type === 'demand' ? 'les demandes' : 'la planification'}</a>
        <button className="text-button" onClick={()=>setConversionResult(null)}>Fermer</button>
      </div>}
      {columnSeparator("index", "Largeur des dossiers")}
      {columnSeparator("list", "Largeur de la liste des notes")}
      <aside className="notebook-index" aria-label="Votre carnet">
        <div className="notebook-index-head">
          <strong>Carnet</strong>
          <button
            className="icon-button"
            aria-label="Nouvelle note"
            onClick={newNote}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="notebook-views" aria-label="Vues des notes">
          {[
            ["all", "Toutes les notes"],
            ["followup", "À suivre"],
            ["review", "À examiner"],
            ["archives", "Archives"],
            ["trash", "Corbeille"],
          ].map(([id, label]) => (
            <button
              key={id}
              data-view={id}
              data-pending={
                id === "review" && inbox.length > 0 ? "true" : undefined
              }
              aria-pressed={view === id && !folder}
              onClick={() => {
                setView(id);
                setFolder(null);
                setWorkspaceFolder(null);
                setTopic("Tous");
                setComposing(false);
                setSubject(null);
                if (id === "review") setSelected(null);
              }}
            >
              <span>{label}</span>
              <small className="notebook-view-count">{viewCounts[id]}</small>
            </button>
          ))}
        </nav>
        <section className="notebook-workspaces" aria-label="Dossiers par workspace">
          <div className="notebook-folders-heading"><span>Workspaces</span></div>
          {catalog.map(w=><button key={w.id} className={workspaceFolder===w.id?'active':''} aria-pressed={workspaceFolder===w.id} onClick={()=>{setWorkspaceFolder(w.id);setFolder(null);setView('all');setComposing(false);setSubject(null);setQuery('');setTopic('Tous');}}><Folder size={18} aria-hidden="true" /><span>{w.name}</span><small>{notes.filter(n=>n.workspace_ids?.includes(w.id)&&!['archived','deleted'].includes(n.state)).length}</small></button>)}

        </section>
        <section
          className="notebook-folders"
          aria-label="Dossiers intelligents"
        >
          <div className="notebook-folders-heading">
            <span>Dossiers intelligents</span>
            <AIProgress scope="topics" />
          <button className="icon-button notebook-organize-button" aria-label={subjects.running ? "Regroupement en cours" : "Regrouper les notes avec l’IA locale"} title="Regrouper les notes à votre clic uniquement" disabled={subjects.running || !data.status?.enabled} onClick={async () => {
            try { await notebookApi("admin/topics/refresh", {method:"POST", body:"{}"}); await load(); }
            catch (e) { onError(e.message); }
          }}><Sparkles size={14} /></button>

          </div>
          {folders
            .filter((t) => !t.hidden || showHiddenFolders)
            .map((t) => (
              <div className="notebook-folder-row" key={t.id}>
                <button
                  className={folder === t.id ? "active" : ""}
                  aria-pressed={folder === t.id}
                  title={`${t.summary || t.title}${t.proposed ? " · Liens à vérifier" : ""}`}
                  onClick={() => {
                    setFolder(t.id);setWorkspaceFolder(null);
                    setTopic("Tous");
                    setView("all");
                    setSubject(null);
                    setComposing(false);
                  }}
                >
                  <Folder className="notebook-folder-icon" size={17} aria-hidden="true" />
                  <span className="notebook-folder-name">
                    <strong>{t.title}</strong>{t.proposed && <i className="notebook-folder-pending" aria-label="Liens à vérifier" />}

                  </span>
                  <small className="notebook-folder-count" aria-label={`${t.noteIds.length} notes`}>{t.noteIds.length}</small>
                </button>
                <button
                  className="notebook-folder-options"
                  aria-label={"Gérer le dossier " + t.title}
                  onClick={() => {
                    setSubject(t);
                    setSelected(null);
                    setComposing(false);
                  }}
                >
                  ···
                </button>
              </div>
            ))}
          {!folders.some((t) => !t.hidden) && (
            <p>
              Cliquez sur Regrouper les notes pour proposer des dossiers par sujet.
            </p>
          )}
          {folders.some((t) => t.hidden) && (
            <button
              className="text-button"
              onClick={() => setShowHiddenFolders((v) => !v)}
            >
              {showHiddenFolders
                ? "Masquer les dossiers cachés"
                : "Dossiers masqués"}
            </button>
          )}
          {subjects.error && (
            <>
              <p className="notebook-folder-error">Regroupement interrompu. Vos notes sont conservées.</p>
              <button
                className="text-button"
                disabled={subjects.running}
                onClick={async () => {
                  try {
                    await notebookApi("admin/topics/refresh", {
                      method: "POST",
                      body: "{}",
                    });
                    await load();
                  } catch (e) {
                    onError(e.message);
                  }
                }}
              >
                Relancer le regroupement
              </button>
            </>
          )}
        </section>
        <div className="notebook-index-footer">
          <span className={data.status?.enabled ? "active" : ""}>●</span>
          <span>
            {data.status?.enabled
              ? "IA à la demande"
              : "Organisation en pause"}
          </span>
          <button
            className="icon-button"
            aria-label="Réglages des notes"
            onClick={() => setSettings(!settings)}
          >
            ···
          </button>
        </div>
      </aside>
      <section className="notebook-list-pane" aria-label="Liste du carnet">
        <div className="notebook-search">
          <Search size={14} />
          <input
            aria-label="Rechercher dans les notes"
            placeholder="Rechercher dans le carnet…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="notebook-list-heading">
          <div>
            <strong>
              {catalog.find(w=>w.id===workspaceFolder)?.name || activeFolder?.title ||
                {
                  all: "Toutes les notes",
                  followup: "À suivre",
                  review: "À examiner",
                  archives: "Archives",
                  trash: "Corbeille",
                }[view]}
            </strong>
            <small>
              {visible.length} note{visible.length > 1 ? "s" : ""}
              {activeFolder?.proposed ? " · Liens à confirmer" : ""}
            </small>
          </div>
          {activeFolder ? (
            <button
              className="icon-button"
              aria-label={
                activeFolder.proposed
                  ? "Vérifier les rapprochements proposés"
                  : "Comprendre ce dossier"
              }
              onClick={() => {
                setSubject(activeFolder);
                setSelected(null);
              }}
            >
              ···
            </button>
          ) : (
            <button
              className="icon-button"
              aria-label="Créer une note"
              onClick={newNote}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {(text.trim() || files.length > 0) && !composing && (
          <button className="notebook-review" onClick={newNote}>
            <FileText size={14} />
            <span>Reprendre le brouillon</span>
          </button>
        )}
        <div className="notebook-note-list" aria-label="Liste des notes">
          {loadError && <button className="button" onClick={() => {setLoadError(""); void load();}}>Réessayer le chargement</button>}
          {visible.map((n, i) => (
            <React.Fragment key={n.id}>
              {(i === 0 ||
                visible[i - 1].created.slice(0, 10) !==
                  n.created.slice(0, 10)) && (
                <h3>
                  {new Date(n.created).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                </h3>
              )}
              <button
                className={`notebook-note ${current?.id === n.id && !composing && !subject ? "selected" : ""}`}
                aria-pressed={current?.id === n.id && !composing && !subject}
                onClick={() => {
                  setSelected(n);
                  setComposing(false);
                  setSubject(null);
                  setClassification(null);
                }}
              >
                <strong>{n.text.split("\n")[0]}</strong>
                <span className="notebook-preview">
                  {n.text.split("\n").slice(1).join(" ") ||
                    [...n.people, ...n.tags].join(" · ") ||
                    "Note personnelle"}
                </span>
                <span className="notebook-note-meta">
                  <time>
                    {new Date(n.created).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                  {n.attachments?.length > 0 && (
                    <span>
                      {n.attachments.length} pièce
                      {n.attachments.length > 1 ? "s" : ""} jointe
                      {n.attachments.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <NoteStateLabels note={n} pending={pending(n)} />
                  <AIProgress
                    noteId={n.id}
                    fallback={
                      ["queued", "running"].includes(latest.get(n.id)?.state)
                        ? { ...latest.get(n.id), ...latest.get(n.id)?.progress }
                        : null
                    }
                  />
                </span>
                <NoteTopicLabels tags={n.tags} limit={2} />
              </button>
            </React.Fragment>
          ))}
          {!visible.length && (
            <p className="notebook-list-empty">
              {!loaded
                ? (loadError || "Chargement…")
                : query
                  ? "Aucune note trouvée."
                  : view === "archives"
                    ? "Aucune note archivée."
                    : view === "followup"
                      ? "Aucune suite à donner."
                      : "Votre première note vous attend."}
            </p>
          )}
        </div>
      </section>
      <section className="notebook-detail" aria-label="Note ouverte">
        <div className="notebook-detail-toolbar">
          <button className="text-button notebook-focus-trigger" aria-label={focusNote ? "Afficher le carnet" : "Agrandir la note"} aria-pressed={focusNote} onClick={()=>setFocusNote(!focusNote)} title={focusNote ? "Afficher les colonnes du carnet" : "Masquer les colonnes pour se concentrer sur la note"}>{focusNote ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{focusNote ? "Afficher le carnet" : "Agrandir la note"}</span></button>
          <button
            className="text-button notebook-back"
            onClick={() => {
              setSelected(null);
              setComposing(false);
              setSubject(null);
              setView("all");
              setSettings(false);
            }}
          >
            ← Le carnet
          </button>
          <div className="notebook-editor-tools-slot" ref={setToolbarTarget}>
            {(settings ||
              subject ||
              (!current && !composing) ||
              current?.state === "archived") && (
              <span>
                {view === "archives"
                  ? "Archives"
                  : subject
                    ? "Sujet détecté"
                    : composing
                      ? "Nouvelle note"
                      : "Note personnelle"}
              </span>
            )}
          </div>
          <div className="notebook-note-actions">
            {current && !composing && !subject && (
              <>
                <details className="notebook-compact-menu">
                  <summary>Insights{pending(current) && <span className="note-insights-pending" aria-label="À examiner" />}</summary>
                  <div><button onClick={e=>{e.currentTarget.closest('details').open=false;setInsightsOpen(true);}}>Analyse</button><button onClick={e=>{e.currentTarget.closest('details').open=false;setDecisionsOpen(true);}}>Décisions</button></div>
                </details>
                <details className="notebook-compact-menu">
                  <summary aria-label="Autres actions de la note">⋯</summary>
                  <div>{[
                    [current.state === 'done' ? 'Réouvrir' : 'Terminer',current.state === 'done' ? 'open' : 'done'],
                    [current.state === 'archived' ? 'Restaurer' : 'Archiver',current.state === 'archived' ? 'open' : 'archived'],
                    [current.state === 'deleted' ? 'Restaurer' : 'Supprimer',current.state === 'deleted' ? 'open' : 'deleted']
                  ].map(([label,state])=><button key={label+state} onClick={e=>{e.currentTarget.closest('details').open=false;update(current,{state});}}>{label}</button>)}</div>
                </details>
                <button className="text-button notebook-insights-trigger" aria-haspopup="dialog" title="Ce que Beam en retient" onClick={() => setInsightsOpen(true)}><Activity size={15} /> Analyse{pending(current) && <span className="note-insights-pending" aria-label="À examiner" />}</button>
                <button className="text-button notebook-decisions-trigger" aria-haspopup="dialog" onClick={() => setDecisionsOpen(true)}><BookmarkCheck size={15} /> Décisions</button>
                <button className="text-button" onClick={()=>update(current,{state:current.state === "deleted" ? "open" : "deleted"})}>{current.state === "deleted" ? "Restaurer" : "Supprimer"}</button>
                <button
                  className="text-button"
                  onClick={() =>
                    update(current, {
                      state: current.state === "archived" ? "open" : "archived",
                    })
                  }
                >
                  {current.state === "archived" ? "Restaurer" : "Archiver"}
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    update(current, {
                      state: current.state === "done" ? "open" : "done",
                    })
                  }
                >
                  {current.state === "done" ? "Réouvrir" : "Terminer"}
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="Créer une nouvelle note"
              onClick={newNote}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        {decisionsOpen && current && createPortal(
          <dialog ref={decisionsDialog} className="note-decisions-dialog" aria-labelledby="note-decisions-title" onCancel={() => setDecisionsOpen(false)} onClick={e => { if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) setDecisionsOpen(false); } }}>
            <header className="note-decisions-header"><div><h2 id="note-decisions-title">Décisions de cette note</h2><p>{current.text.split("\n")[0].slice(0, 100)}</p></div><button className="icon-button" aria-label="Fermer les décisions" onClick={() => setDecisionsOpen(false)}><Close size={18} /></button></header>
            <div className="note-decisions-body">
            <DecisionMemory
              key={current.id}
              api={(path,options={})=>api(path,{...options,headers:{...options.headers,"X-Beam-Workspace":conversionContext(current,catalog,workspaceId,"task").workspaceId}})}
              note={current}
              items={catalog.find(w=>w.id===conversionContext(current,catalog,workspaceId,"task").workspaceId)?.items || items}
              onError={onError}
              onChange={load}
              hideEmptyMessage={false}
            />
            </div>
          </dialog>, document.body)}
        {insightsOpen && current && createPortal(
          <dialog ref={insightsDialog} className="note-decisions-dialog note-insights-dialog" aria-labelledby="note-insights-title" onCancel={() => setInsightsOpen(false)} onClick={e => { if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) setInsightsOpen(false); } }}>
            <header className="note-decisions-header"><div><h2 id="note-insights-title">Ce que Beam en retient</h2><p>{current.text.split("\n")[0].slice(0, 100)}</p></div><button className="icon-button" aria-label="Fermer l’analyse de la note" onClick={() => setInsightsOpen(false)}><Close size={18} /></button></header>
            <div className="note-decisions-body">
              <div className="notebook-insights-body">
                <section className="notes-v2-recognized">
                  <h3>Informations reconnues</h3>
                  <dl>
                    <dt>Sujets</dt>
                    <dd>{current.tags.join(", ") || "À identifier"}</dd>
                    <dt>Personnes</dt>
                    <dd>{current.people.join(", ") || "Non précisé"}</dd>
                    <dt>Intention</dt>
                    <dd>{NOTE_KINDS[current.kind]}</dd>
                    <dt>Échéance</dt>
                    <dd>
                      {current.due ? dateLabel(current.due) : "Non précisée"}
                    </dd>
                  </dl>
                  <small>
                    Classement proposé après analyse, corrigible à tout moment.
                  </small>
                  <button
                    className="text-button"
                    onClick={() =>
                      setClassification({
                        kind: current.kind,
                        people: current.people.join(", "),
                        tags: current.tags.join(", "),
                        due: current.due || "",
                      })
                    }
                  >
                    Corriger les informations
                  </button>
                  {classification && (
                    <form
                      className="note-editor-grid"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await update(current, {
                          classification: {
                            ...classification,
                            people: classification.people
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                            tags: classification.tags
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                            due: classification.due || null,
                          },
                        });
                        setClassification(null);
                      }}
                    >
                      <label>
                        Intention
                        <select
                          value={classification.kind}
                          onChange={(e) =>
                            setClassification({
                              ...classification,
                              kind: e.target.value,
                            })
                          }
                        >
                          {Object.entries(NOTE_KINDS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      {[
                        ["people", "Personnes"],
                        ["tags", "Sujets"],
                        ["due", "Échéance"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            type={key === "due" ? "date" : "text"}
                            value={classification[key]}
                            onChange={(e) =>
                              setClassification({
                                ...classification,
                                [key]: e.target.value,
                              })
                            }
                          />
                        </label>
                      ))}
                      <button className="button">Enregistrer</button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setClassification(null)}
                      >
                        Annuler
                      </button>
                    </form>
                  )}
                </section>

                <LocalAssistant
                  key={current.id}
                  api={notebookApi}
                  items={items}
                  scope="note"
                  entity={current}
                  onData={setData}
                  sharedData={data}
                  onRefresh={async () => {
                    await load();
                    await onRefresh?.();
                  }}
                />
              </div>
            </div>
          </dialog>, document.body)}
        {settings ? (
          <div className="notebook-paper">
            <button className="text-button" onClick={() => setSettings(false)}>
              Revenir au carnet
            </button>
            <LocalAssistant
              api={notebookApi}
              items={items}
              settingsOnly
              onData={setData}
                  sharedData={data}
            />
          </div>
        ) : subject ? (
          <div className="notebook-paper">
            <TopicDetail
              key={subject.id}
              topic={subject}
              topics={subjects.topics}
              items={catalog.find(w=>w.id==='default')?.items || []}
              api={notebookApi}
              refresh={load}
              onError={onError}
              onNote={(id) => {
                setSubject(null);
                setView("all");
                setSelected(notes.find((n) => n.id === id));
              }}
              onPrepare={onPrepare}
              onOpen={onOpen}
            />
          </div>
        ) : composing ? (
          <form className="notebook-paper notebook-composer" onSubmit={save}>
            <div className="notebook-date">
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <RichNoteEditor
              text={text}
              document={richDraft}
              catalog={catalog}
              onReference={openReference}
              onCommand={(type,snapshot)=>void save(null,snapshot,type)}
              label="Nouvelle note"
              toolbarTarget={toolbarTarget}
              autoFocus
              onChange={({ text, document }) => {
                setText(text);
                setRichDraft(document);
              }}
              onSave={() => void save()}
              onFiles={(chosen) => setFiles([...files, ...chosen].slice(0, 4))}
            />
            <DraftImages files={files} />
            <div className="notebook-compose-actions">
              <label className="button attachment-picker">
                Joindre un fichier
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  disabled={busy}
                  onChange={(e) => {
                    setFiles(
                      [...files, ...Array.from(e.target.files)].slice(0, 4),
                    );
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="button primary"
                disabled={busy || (!text.trim() && !files.length)}
              >
                {busy ? "Enregistrement…" : "Enregistrer"}
                <ArrowRight size={14} />
              </button>
            </div>
            {files.length > 0 && (
              <div className="notes-v2-files">
                {files.map((f, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    {f.name} ×
                  </button>
                ))}
              </div>
            )}
            <small className="notebook-hint">
              ⌘ Entrée pour enregistrer · Brouillon conservé dans cette fenêtre
            </small>
          </form>
        ) : current ? (
          <div className="notebook-paper" key={current.id}>
            <InlineNoteEditor
              note={current}
              catalog={catalog}
              onReference={openReference}
              onCommand={async (type,snapshot)=>{try {const n=await api(`admin/notes/${current.id}`,{method:'PATCH',body:JSON.stringify(snapshot)});await load();convert(type,n);}catch(e){onError(e.message);}}}
              update={update}
              pending={pending(current)}
              toolbarTarget={toolbarTarget}
              onFiles={async (chosen) => {
                setBusy(true);
                try {
                  await attach(current.id, chosen);
                  await load();
                } catch (e) {
                  onError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
            {current.attachments?.length > 0 && (
              <section
                className="notebook-attachments"
                aria-label="Pièces jointes"
              >
                {current.attachments
                  .filter((a) => a.mime.startsWith("image/"))
                  .map((a) => (
                    <NoteImage
                      key={a.id}
                      attachment={a}
                      workspace={workspaceId}
                      onError={onError}
                      onOpen={() => download(a)}
                    />
                  ))}
                {current.attachments
                  .filter((a) => !a.mime.startsWith("image/"))
                  .map((a) => (
                    <button
                      className="notebook-attachment"
                      key={a.id}
                      onClick={() => download(a)}
                    >
                      <FileText size={20} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {a.mime === "application/pdf"
                            ? `${a.pages || ""} page(s) · PDF`
                            : "Image"}{" "}
                          · Ouvrir
                        </small>
                      </span>
                    </button>
                  ))}
              </section>
            )}
            <div className="note-workspace-links" aria-label="Workspaces associés">
              {(current.workspace_ids || []).map(id=><span key={id}><button className="text-button" onClick={()=>{setWorkspaceFolder(id);setFolder(null);setView('all');}}>@{catalog.find(w=>w.id===id)?.name || 'Workspace'}</button><button className="text-button" aria-label="Retirer ce workspace de la note" onClick={()=>void removeWorkspace(current,id)}>×</button></span>)}
              {(current.proposed_workspace_ids || []).map(id=><button key={'proposal:'+id} className="text-button" onClick={()=>void update(current,{workspace_ids:[...current.workspace_ids,id]})}>Associer à {catalog.find(w=>w.id===id)?.name} ?</button>)}
            </div>
            <div className="note-conversion-actions" hidden={current.state === "deleted"}>
              <span>Transformer cette note</span>
              <div>
                {['demand','task','feature'].map(type=><button key={type} className="button" onClick={()=>{const excerpt=window.getSelection()?.toString();convert(type,current,excerpt&&current.text.includes(excerpt)?excerpt:undefined);}}>En {type==='demand'?'demande':type==='task'?'tâche':'feature'}</button>)}
              </div>
              <small>La note reste dans votre carnet. Vérifiez le contenu avant de le partager dans la roadmap.</small>
            </div>

          </div>
        ) : view === "review" ? (
          <div className="notebook-paper notebook-inbox">
            <ReviewInbox
              rows={inbox}
              loading={!loaded}
              query={query}
              api={notebookApi}
              onRefresh={load}
              onError={onError}
              onOpenSource={(id) => {
                const note=notes.find(n=>n.id===id);
                if(note){setSelected(note);setView("all");setSubject(null);setComposing(false);} else onError("Cette note n’est plus disponible.");
              }}
              onExamine={(row) => {
                if (row.kind === "contradiction") {
                  const item = items.find((i) => i.id === row.item_id);
                  if (item) onOpen(item);
                  else onError("Cet élément n’est plus disponible.");
                  return;
                }
                if (row.kind === "topic") {
                  setSubject(
                    subjects.topics.find((t) => t.id === row.topic_id),
                  );
                  return;
                }
                const n = notes.find(
                  (n) => n.id === (row.note_id || row.entity_id),
                );
                if (n) {
                  setSelected(n);
                  return;
                }
                const item = items.find(
                  (i) => i.id === (row.item_id || row.entity_id),
                );
                if (item) onOpen(item);
                else onError("Cet élément n’est plus disponible.");
              }}
            />
          </div>
        ) : (
          <div className="notebook-blank">
            <FileText size={30} />
            <h2>Une note, simplement.</h2>
            <p>Capturez une pensée. Beam vous aide à en retrouver le fil.</p>
            <button className="button" onClick={newNote}>
              <Plus size={15} />
              Nouvelle note
            </button>
          </div>
        )}
      </section>
    </div>
    </AIActivityProvider>
  );
}
function NoteStateLabels({ note, pending }) {
  return (
    <>
      {note.state === "done" ? (
        <span className="note-state-chip is-done">Terminé</span>
      ) : note.state === "open" &&
        ["action", "followup"].includes(note.kind) ? (
        <span className="note-state-chip is-followup">À suivre</span>
      ) : null}
      {pending && <span className="note-state-chip is-review">À examiner</span>}
    </>
  );
}
function NoteTopicLabels({ tags = [], limit = 3 }) {
  const colors = ["#b3a1e5", "#8cb5d5", "#b5ab89", "#91b8aa", "#c49fae"];
  return tags.length > 0 ? (
    <span className="note-topic-labels">
      {tags.slice(0, limit).map((tag) => {
        const hash = [...tag.toLocaleLowerCase("fr")].reduce(
          (a, c) => (a * 31 + c.codePointAt(0)) >>> 0,
          0,
        );
        return (
          <span
            className="note-topic-label"
            key={tag}
            style={{ "--topic-color": colors[hash % colors.length] }}
          >
            <i aria-hidden="true" />
            {tag}
          </span>
        );
      })}
    </span>
  ) : null;
}
function InlineNoteEditor({ note, update, pending, onFiles, toolbarTarget,catalog,onCommand,onReference }) {
  const [draft, setDraft] = usePersistentDraft("note-edit:" + note.id, null, true);
  const [saving, setSaving] = useState(false);
  const [associationSaved, setAssociationSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const value = typeof draft === "string" ? draft : (draft?.text ?? note.text);
  const document =
    typeof draft === "object" && draft ? draft.document : note.document;
  const dirty =
    value !== note.text ||
    JSON.stringify(document) !== JSON.stringify(note.document);
  const mentionSignature = doc => JSON.stringify((function collect(node) {return [...(node?.type === "mention" ? [node.attrs] : []), ...(node?.content || []).flatMap(collect)];})(doc));
  const mentionsChanged = mentionSignature(document) !== mentionSignature(note.document);
  useEffect(() => {
    if (!dirty || !value.trim() || saving || saveError || ["archived","deleted"].includes(note.state)) return;
    const timer=setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [document, value, dirty, saving, saveError, note.state]);
  async function save() {
    if (!dirty || !value.trim() || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      const snapshot = JSON.stringify(draft);
      if (await update(note, { text: value, ...(document ? { document } : {}) })) {
        setDraft(current => JSON.stringify(current) === snapshot ? null : current);
        if (mentionsChanged) setAssociationSaved(true);
      } else setSaveError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="notebook-date">
        {new Date(note.created).toLocaleString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="notebook-paper-labels">
        <NoteStateLabels note={note} pending={pending} />
        <NoteTopicLabels tags={note.tags} />
      </div>
      <RichNoteEditor
        text={value}
        catalog={catalog}
        onReference={onReference}
        onCommand={async (type,snapshot)=>{await onCommand?.(type,snapshot);}}
        toolbarTarget={toolbarTarget}
        document={document}
        readOnly={["archived","deleted"].includes(note.state)}
        onChange={next=>{setSaveError(false);setDraft(next);}}
        onSave={() => void save()}
        onFiles={note.state === "archived" ? undefined : onFiles}
      />
      {associationSaved && !mentionsChanged && <small className="note-association-status" role="status">Rattachements enregistrés</small>}
      <div className={`note-save-status ${saveError ? 'has-error' : ''}`} role="status">{saving ? 'Enregistrement sur ce Mac…' : saveError ? 'Enregistrement impossible · brouillon conservé' : dirty ? 'Brouillon conservé sur ce Mac' : 'Enregistré sur ce Mac'}</div>
      {dirty && saveError && (
        <div className="notebook-edit-status">
          <small>Votre texte est conservé. Réessayez l’enregistrement.</small>
          <button
            className="button"
            disabled={saving || !value.trim()}
            onClick={save}
          >
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      )}
    </>
  );
}

function TopicDetail({
  topic,
  topics,
  items,
  api,
  refresh,
  onError,
  onNote,
  onPrepare,
  onOpen,
}) {
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState(topic.title);
  async function patch(body) {
    try {
      await api(`admin/topics/${topic.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await refresh();
    } catch (e) {
      onError(e.message);
    }
  }
  async function move(source, id) {
    try {
      if (id === "new") {
        const title = prompt("Nom du nouveau sujet");
        if (!title?.trim()) return;
        const created = await api("admin/topics", {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        id = created.id;
      }

      await api("admin/topics/move", {
        method: "POST",
        body: JSON.stringify({ source, topic_id: id || null }),
      });
      await refresh();
    } catch (e) {
      onError(e.message);
    }
  }
  return (
    <section className="topic-detail">
      <p className="assistant-help">
        Synthèse des signaux · La fréquence ne détermine pas la priorité.
      </p>
      <p>{topic.summary}</p>
      <button
        className="text-button"
        onClick={() => patch({ hidden: !topic.hidden })}
      >
        {topic.hidden ? "Afficher dans les dossiers" : "Masquer ce dossier"}
      </button>
      {topic.questions.length > 0 && (
        <>
          <h3>À clarifier</h3>
          <ul>
            {topic.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
      <label>
        Feature associée
        <select
          value={topic.item_id || ""}
          onChange={(e) => patch({ item_id: e.target.value })}
        >
          <option value="">Sans rattachement</option>
          {items
            .filter((i) => !i.archived)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
        </select>
      </label>
      {topic.item_id && (
        <button
          className="text-button"
          onClick={() => onOpen(items.find((i) => i.id === topic.item_id))}
        >
          Ouvrir l’élément associé
        </button>
      )}
      <ProductBrief
        key={topic.id}
        topicId={topic.id}
        api={api}
        onPrepare={onPrepare}
        onError={onError}
      />
      <h3>Sources · {topic.sources.length}</h3>
      {topic.sources.map((s) => (
        <article className="topic-source" key={s.id}>
          <small>
            {s.kind} · {new Date(s.created).toLocaleDateString("fr-FR")}
            {s.confidence === "review" ? " · Rapprochement à confirmer" : ""}
          </small>
          {s.id.startsWith("note:") ? (
            <button
              className="text-button"
              onClick={() => onNote(s.id.slice(5))}
            >
              {s.title}
            </button>
          ) : (
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
          )}
          <label className="topic-source-move">
            Classer dans
            <select
              aria-label={"Sujet de " + s.title}
              value={topic.id}
              onChange={(e) => move(s.id, e.target.value)}
            >
              <option value="">Retirer du sujet</option>
              <option value="new">Créer un nouveau sujet…</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          {s.confidence === "review" && (
            <button
              className="text-button"
              onClick={() => move(s.id, topic.id)}
            >
              Confirmer le rapprochement
            </button>
          )}
        </article>
      ))}
      <details>
        <summary>Organiser ce sujet</summary>
        <button className="text-button" onClick={() => setRenaming(!renaming)}>
          Renommer
        </button>
        {renaming && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patch({ title: name });
              setRenaming(false);
            }}
          >
            <input
              aria-label="Nom du sujet"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="button">Enregistrer</button>
          </form>
        )}
        <label>
          Fusionner dans
          <select
            defaultValue=""
            onChange={(e) => {
              if (
                e.target.value &&
                confirm("Fusionner ce sujet ? Les sources seront regroupées.")
              )
                patch({ merge_into: e.target.value });
            }}
          >
            <option value="">Choisir un sujet</option>
            {topics
              .filter((t) => t.id !== topic.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
      </details>
    </section>
  );
}
