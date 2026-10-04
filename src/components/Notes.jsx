import NoteImage, { DraftImages } from "./NoteImage";
import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import { DemandCapture } from "./Demands";
import { receiveNoteTransfer } from "../../shared/note-transfer";
import { usePersistentDraft } from "../usePersistentDraft";
import ProductBrief from "./ProductBrief";
import DecisionMemory from "./DecisionMemory";
import ReviewInbox from "./ReviewInbox";
import { includesSearch } from "../../shared/search";
import AIProgress from "./AIProgress";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
const LazyRichNoteEditor = lazy(() => import("./RichNoteEditor"));
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
  const key =
    "beam_note_draft:" +
    (workspaceId ||
      new URLSearchParams(location.search).get("workspace") ||
      "default");
  const [entry, setEntry] = useState(() => ({
    key,
    text: localStorage.getItem(key) || "",
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
}) {
  const workspaceId =
    new URLSearchParams(location.search).get("workspace") || "default";
  const [demandNote, setDemandNote] = useState(null);
  const [composerKey, setComposerKey] = useState(
    () =>
      sessionStorage.getItem("beam-capture-composer:" + workspaceId) ||
      "note-composer",
  );
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [richDraft, setRichDraft] = usePersistentDraft(
    composerKey + ":document",
    null,
  );
  const [notes, setNotes] = useState([]),
    [text, setText] = usePersistentDraft(composerKey, ""),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("all"),
    [topic, setTopic] = useState("Tous"),
    [folder, setFolder] = useState(null),
    [showHiddenFolders, setShowHiddenFolders] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [subjects, setSubjects] = useState({ topics: [], unassigned: [] }),
    [subject, setSubject] = useState(null),
    [settings, setSettings] = useState(false),
    [data, setData] = useState({ status: null, reviews: [] }),
    [classification, setClassification] = useState(null);
  const [composing, setComposing] = useState(
    () => composerKey !== "note-composer" && !initialTarget,
  );
  const composer = useRef(null);
  useEffect(() => {
    onCaptureDraft?.({ text, composing, hasFiles: files.length > 0, busy });
  }, [text, composing, files.length, busy, onCaptureDraft]);
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
  const [loaded, setLoaded] = useState(false);
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
  async function load() {
    try {
      const [n, status, reviews, groups, queue] = await Promise.all([
        api("admin/notes"),
        api("admin/ai/status"),
        api("admin/ai/reviews"),
        api("admin/topics"),
        api("admin/inbox"),
      ]);
      setInbox((previous) => unchangedData(previous, queue));
      onInboxCount?.(queue.length);
      setLoaded(true);
      setNotes((previous) => unchangedData(previous, n));
      setSubjects((previous) => unchangedData(previous, groups));
      setSubject((previous) =>
        previous
          ? unchangedData(
              previous,
              groups.topics.find((t) => t.id === previous.id) || null,
            )
          : null,
      );
      setData((previous) => unchangedData(previous, { status, reviews }));
    } catch (e) {
      onError(e.message);
    }
  }
  useVisiblePolling(
    load,
    data.reviews.some((r) => ["queued", "running"].includes(r.state))
      ? 4000
      : 12000,
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
  const current = notes.find((n) => n.id === selected?.id) || null;
  const topics = [
    ...new Set(
      notes.filter((n) => n.state !== "archived").flatMap((n) => n.tags),
    ),
  ];
  const folders = subjects.topics
    .map((t) => ({
      ...t,
      noteIds: t.sources
        .filter((s) => s.id.startsWith("note:") && s.confidence === "clear")
        .map((s) => s.id.slice(5)),
    }))
    .filter((t) => t.folderEligible || t.noteIds.length >= 2);
  const activeFolder = folders.find((t) => t.id === folder);
  const visible = notes.filter(
    (n) =>
      (view === "archives" ? n.state === "archived" : n.state !== "archived") &&
      (view !== "followup" ||
        (n.state === "open" && ["action", "followup"].includes(n.kind))) &&
      (view !== "review" || pending(n)) &&
      (topic === "Tous" || n.tags.includes(topic)) &&
      (!activeFolder || activeFolder.noteIds.includes(n.id)) &&
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
  }, [loaded, notes, view, topic, query, composing, subject, folder, subjects]);
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
  async function save(e) {
    e?.preventDefault();
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    try {
      const n = await api("admin/notes", {
        method: "POST",
        body: JSON.stringify({
          text: text.trim() || files.map((f) => f.name).join(", "),
          ...(text.trim() && richDraft ? { document: richDraft } : {}),
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
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function update(n, body) {
    try {
      await api(`admin/notes/${n.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
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
    <div
      className={`notes-notebook ${composing || current || subject || settings || view === "review" ? "has-detail" : ""}`}
    >
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
                setTopic("Tous");
                setComposing(false);
                setSubject(null);
                if (id === "review") setSelected(null);
              }}
            >
              <span>{label}</span>
              {id === "review" && inbox.length > 0 && (
                <small className="notebook-view-count">{inbox.length}</small>
              )}
            </button>
          ))}
        </nav>
        <section
          className="notebook-folders"
          aria-label="Dossiers intelligents"
        >
          <div className="notebook-folders-heading">
            <span>Dossiers intelligents</span>
            <AIProgress scope="topics" />
          </div>
          {folders
            .filter((t) => !t.hidden || showHiddenFolders)
            .map((t) => (
              <div className="notebook-folder-row" key={t.id}>
                <button
                  className={folder === t.id ? "active" : ""}
                  aria-pressed={folder === t.id}
                  title={t.summary}
                  onClick={() => {
                    setFolder(t.id);
                    setTopic("Tous");
                    setView("all");
                    setSubject(null);
                    setComposing(false);
                  }}
                >
                  <FileText size={14} />
                  <span>{t.title}</span>
                  <small>{t.noteIds.length}</small>
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
              Les notes qui parlent d’un même sujet seront réunies ici. Leurs
              liens sont analysés sur ce Mac.
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
          {subjects.error && <p>{subjects.error}</p>}
        </section>
        <div className="notebook-index-footer">
          <span className={data.status?.enabled ? "active" : ""}>●</span>
          <span>
            {data.status?.enabled
              ? "Organisé sur ce Mac"
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
              {activeFolder?.title ||
                {
                  all: "Toutes les notes",
                  followup: "À suivre",
                  review: "À examiner",
                  archives: "Archives",
                }[view]}
            </strong>
            <small>
              {visible.length} note{visible.length > 1 ? "s" : ""}
            </small>
          </div>
          {activeFolder ? (
            <button
              className="icon-button"
              aria-label="Comprendre ce dossier"
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
                ? "Chargement…"
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
          <div>
            {current && !composing && !subject && (
              <>
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
        {settings ? (
          <div className="notebook-paper">
            <button className="text-button" onClick={() => setSettings(false)}>
              Revenir au carnet
            </button>
            <LocalAssistant
              api={api}
              items={items}
              settingsOnly
              onData={setData}
            />
          </div>
        ) : subject ? (
          <div className="notebook-paper">
            <TopicDetail
              key={subject.id}
              topic={subject}
              topics={subjects.topics}
              items={items}
              api={api}
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
            <label className="text-button attachment-picker notebook-attach">
              Joindre un fichier
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                disabled={busy}
                onChange={async (e) => {
                  const chosen = Array.from(e.target.files);
                  e.target.value = "";
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
            </label>
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
            <button className="button" onClick={() => setDemandNote(current)}>
              Préparer une demande
            </button>
            {demandNote && (
              <div className="demand-overlay">
                <DemandCapture
                  key={demandNote.id}
                  note={demandNote}
                  api={api}
                  onError={onError}
                  onClose={() => setDemandNote(null)}
                  onDone={() => onRefresh?.()}
                />
              </div>
            )}
            <DecisionMemory
              key={current.id}
              api={api}
              note={current}
              items={items}
              onError={onError}
              onChange={load}
              hideEmptyMessage
            />
            <details
              className="notebook-insights"
              open={view === "review" ? true : undefined}
            >
              <summary>
                <Activity size={16} />
                <span>Ce que Beam en retient</span>
                {pending(current) && <small>À examiner</small>}
                <AIProgress noteId={current.id} />
              </summary>
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
                    Classement automatique, corrigible à tout moment.
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
                  api={api}
                  items={items}
                  scope="note"
                  entity={current}
                  onData={setData}
                  onRefresh={async () => {
                    await load();
                    await onRefresh?.();
                  }}
                />
              </div>
            </details>
          </div>
        ) : view === "review" ? (
          <div className="notebook-paper notebook-inbox">
            <ReviewInbox
              rows={inbox}
              loading={!loaded}
              query={query}
              api={api}
              onRefresh={load}
              onError={onError}
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
function InlineNoteEditor({ note, update, pending, onFiles, toolbarTarget }) {
  const [draft, setDraft] = usePersistentDraft("note-edit:" + note.id, null);
  const [saving, setSaving] = useState(false);
  const value = typeof draft === "string" ? draft : (draft?.text ?? note.text);
  const document =
    typeof draft === "object" && draft ? draft.document : note.document;
  const dirty =
    value !== note.text ||
    JSON.stringify(document) !== JSON.stringify(note.document);
  async function save() {
    if (!dirty || !value.trim() || saving) return;
    setSaving(true);
    try {
      if (
        await update(note, { text: value, ...(document ? { document } : {}) })
      )
        setDraft(null);
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
        toolbarTarget={toolbarTarget}
        document={document}
        readOnly={note.state === "archived"}
        onChange={setDraft}
        onSave={() => void save()}
        onFiles={note.state === "archived" ? undefined : onFiles}
      />
      {dirty && (
        <div className="notebook-edit-status">
          <small>Brouillon conservé · ⌘ Entrée pour enregistrer</small>
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
