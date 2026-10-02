import AIProgress from "./AIProgress";
import React, { useEffect, useRef, useState } from "react";
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
function useDraft() {
  const [text, setText] = useState(
    () => localStorage.getItem("beam_note_draft") || "",
  );
  useEffect(() => {
    localStorage.setItem("beam_note_draft", text);
  }, [text]);
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
    const capture = () => {
      const otherDialog = document.querySelector(
        '[role="dialog"]:not([aria-label="Capture rapide"])',
      );
      if (otherDialog) return false;
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
  items,
  onError,
  onOpen,
  onRefresh,
  onPrepare,
}) {
  const [notes, setNotes] = useState([]),
    [text, setText] = useState(""),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("all"),
    [topic, setTopic] = useState("Tous"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [subjects, setSubjects] = useState({ topics: [], unassigned: [] }),
    [subject, setSubject] = useState(null),
    [settings, setSettings] = useState(false),
    [data, setData] = useState({ status: null, reviews: [] }),
    [classification, setClassification] = useState(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState("");
  const trigger = useRef(null);
  async function load() {
    try {
      const [n, status, reviews, groups] = await Promise.all([
        api("admin/notes"),
        api("admin/ai/status"),
        api("admin/ai/reviews"),
        api("admin/topics"),
      ]);
      setNotes(n);
      setSubjects(groups);
      setSubject((previous) =>
        previous
          ? groups.topics.find((t) => t.id === previous.id) || null
          : null,
      );
      setData({ status, reviews });
    } catch (e) {
      onError(e.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    window.addEventListener("beam:notes", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("beam:notes", load);
    };
  }, []);
  const latest = new Map();
  for (const r of data.reviews)
    if (r.scope === "note" && !latest.has(r.entity_id))
      latest.set(r.entity_id, r);
  const pending = (n) =>
    latest
      .get(n.id)
      ?.result?.proposals?.some((p) => !p.applied && !p.dismissed);
  const current = notes.find((n) => n.id === selected?.id) || selected;
  const topics = [
    ...new Set(
      notes.filter((n) => n.state !== "archived").flatMap((n) => n.tags),
    ),
  ];
  const visible = notes.filter(
    (n) =>
      (view === "archives" ? n.state === "archived" : n.state !== "archived") &&
      (view !== "followup" ||
        (n.state === "open" && ["action", "followup"].includes(n.kind))) &&
      (view !== "review" || pending(n)) &&
      (topic === "Tous" || n.tags.includes(topic)) &&
      (!query ||
        [
          n.text,
          ...n.people,
          ...n.tags,
          ...(n.attachments || []).map((a) => a.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
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
        }),
      });
      setText("");
      const chosen = files;
      setFiles([]);
      await attach(n.id, chosen);
      await load();
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
    } catch (e) {
      onError(e.message);
    }
  }
  async function download(a) {
    try {
      const response = await fetch(`/api/admin/attachments/${a.id}`, {
        headers: {
          Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
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
    <div className="notes-v2">
      {subject && (
        <NoteProposalPanel
          note={{
            text: (subjects.topics.find((t) => t.id === subject.id) || subject)
              .title,
          }}
          close={() => setSubject(null)}
        >
          <TopicDetail
            topic={subjects.topics.find((t) => t.id === subject.id) || subject}
            topics={subjects.topics}
            items={items}
            api={api}
            refresh={load}
            onError={onError}
            onNote={(id) => {
              setSubject(null);
              setSelected(notes.find((n) => n.id === id));
            }}
            onPrepare={(draft) => {
              setSubject(null);
              onPrepare?.(draft);
            }}
            onOpen={(item) => {
              setSubject(null);
              onOpen(item);
            }}
          />
        </NoteProposalPanel>
      )}

      <div className="notes-v2-status">
        <span className={data.status?.enabled ? "active" : ""}>●</span>{" "}
        {data.status?.enabled ? "Organisation active" : "Organisation en pause"}
        <AIProgress scope="associations" />
        <button
          className="icon-button"
          aria-label="Réglages des notes"
          onClick={() => setSettings(!settings)}
        >
          ···
        </button>
      </div>
      {settings && (
        <div className="notes-v2-settings">
          <LocalAssistant
            api={api}
            items={items}
            settingsOnly
            onData={setData}
          />
          <button
            className="text-button"
            onClick={() => {
              setView(view === "archives" ? "all" : "archives");
              setSettings(false);
            }}
          >
            {" "}
            {view === "archives" ? "Retour aux notes" : "Voir les archives"}
          </button>
        </div>
      )}
      <form className="notes-v2-capture" onSubmit={save}>
        <textarea
          aria-label="Nouvelle note"
          placeholder="Une idée, un échange, une suite à donner…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="notes-v2-capture-footer">
          <label className="button attachment-picker">
            Joindre un fichier
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              disabled={busy}
              onChange={(e) => {
                setFiles([...files, ...Array.from(e.target.files)].slice(0, 4));
                e.target.value = "";
              }}
            />
          </label>
          <small>
            {busy
              ? "Enregistrement et lecture des fichiers…"
              : "Entrée pour enregistrer · ⇧Entrée pour une nouvelle ligne"}
          </small>
          <button
            className="icon-button"
            aria-label="Enregistrer la note"
            disabled={busy || (!text.trim() && !files.length)}
          >
            <ArrowRight size={18} />
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
      </form>
      <div className="notes-v2-toolbar">
        <nav aria-label="Vues des notes">
          {[
            ["all", "Toutes"],
            ["followup", "À suivre"],
            ["review", "À examiner"],
            ...(view === "archives" ? [["archives", "Archives"]] : []),
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {label}
              {id === "review" &&
                notes.filter((n) => n.state !== "archived" && pending(n))
                  .length > 0 && (
                  <span>
                    {
                      notes.filter((n) => n.state !== "archived" && pending(n))
                        .length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <input
          aria-label="Rechercher dans les notes"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="living-topics">
        <div className="living-topics-head">
          <span>Sujets vivants</span>
          <AIProgress scope="topics" showLabel />
          <button
            className="text-button"
            onClick={async () => {
              try {
                await api("admin/topics/refresh", { method: "POST" });
                await load();
              } catch (e) {
                onError(e.message);
              }
            }}
          >
            {subjects.running ? "Regroupement…" : "Actualiser"}
          </button>
        </div>
        {subjects.error && <small role="status">{subjects.error}</small>}
        <div className="notes-v2-topics">
          {subjects.topics.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setSubject(t);
                setSelected(null);
              }}
            >
              {t.title}{" "}
              <span>
                {t.sources.filter((s) => s.confidence === "clear").length}
              </span>
              {t.sources.some((s) => s.confidence === "review")
                ? " · À examiner"
                : ""}
            </button>
          ))}
          {!subjects.topics.length && (
            <small>
              Les liens entre vos notes et tickets apparaîtront ici au fil des
              analyses.
            </small>
          )}
        </div>
      </div>
      {topics.length > 0 && (
        <div className="notes-v2-topics">
          <small>Sujets</small>
          {["Tous", ...topics].map((t) => (
            <button
              className={topic === t ? "active" : ""}
              onClick={() => setTopic(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="notes-v2-list">
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
              className="notes-v2-row"
              onClick={(e) => {
                trigger.current = e.currentTarget;
                setSelected(n);
                setEditing(false);
                setClassification(null);
              }}
            >
              <FileText size={17} />
              <div>
                <strong>{n.text}</strong>
                <small>
                  {[...n.people, ...n.tags].slice(0, 3).join(" · ") || "Note"}
                  {n.attachments?.length > 0 &&
                    ` · ${n.attachments.length} pièce(s) jointe(s)`}
                </small>
              </div>
              <span className="notes-v2-indicator">
                {pending(n)
                  ? "Proposition"
                  : ["queued", "running"].includes(latest.get(n.id)?.state)
                    ? ""
                    : latest.get(n.id)?.state === "error"
                      ? "À relancer"
                      : n.due
                        ? dateLabel(n.due)
                        : ""}
              </span>
              <time>
                {new Date(n.created).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <AIProgress
                noteId={n.id}
                fallback={
                  ["queued", "running"].includes(latest.get(n.id)?.state)
                    ? { ...latest.get(n.id), ...latest.get(n.id)?.progress }
                    : null
                }
              />
            </button>
          </React.Fragment>
        ))}
        {!visible.length && (
          <div className="empty">
            <FileText size={24} />
            <h3>
              {view === "review"
                ? "Tout est au clair"
                : "Votre carnet est prêt"}
            </h3>
            <p>
              {view === "review"
                ? "Les propositions à examiner apparaîtront ici."
                : "Notez un échange ou joignez un document pour commencer."}
            </p>
          </div>
        )}
      </div>
      <small className="notes-v2-privacy">
        Organisé sur ce Mac · Les changements de roadmap restent à valider
      </small>
      {current && (
        <NoteProposalPanel
          note={current}
          close={() => {
            setSelected(null);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        >
          <div className="notes-v2-detail-actions">
            <button
              className="text-button"
              onClick={() => {
                setDraft(current.text);
                setEditing(!editing);
              }}
            >
              Modifier la note
            </button>
            <label className="button attachment-picker">
              Joindre
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                disabled={busy}
                onChange={async (e) => {
                  const f = Array.from(e.target.files);
                  e.target.value = "";
                  setBusy(true);
                  try {
                    await attach(current.id, f);
                    await load();
                  } catch (e) {
                    onError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          </div>
          {editing && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await update(current, { text: draft });
                setEditing(false);
              }}
            >
              <textarea
                aria-label="Modifier le texte de la note"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="button">Enregistrer</button>
            </form>
          )}
          {current.attachments?.length > 0 && (
            <section className="notes-v2-attachments">
              <h3>Pièces jointes</h3>
              {current.attachments.map((a) => (
                <button
                  className="button"
                  key={a.id}
                  onClick={() => download(a)}
                >
                  <FileText size={14} />
                  {a.name}
                  {a.mime === "application/pdf" ? ` · ${a.pages} page(s)` : ""}
                </button>
              ))}
              <small>
                Les documents et images participent à l’analyse de cette note.
              </small>
            </section>
          )}
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
              <dd>{current.due ? dateLabel(current.due) : "Non précisée"}</dd>
            </dl>
            <small>Classement automatique, corrigible à tout moment.</small>
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
          <div className="notes-v2-detail-actions">
            <button
              className="button"
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
          </div>
        </NoteProposalPanel>
      )}
    </div>
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
      {onPrepare && (
        <button
          className="button"
          onClick={() =>
            onPrepare({ title: topic.title, description: topic.summary })
          }
        >
          Préparer une feature
        </button>
      )}
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
function NoteProposalPanel({ note, close, children }) {
  const panel = useRef(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = [
          ...panel.current.querySelectorAll(
            "button:not(:disabled),a[href],select,input,textarea,summary",
          ),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key, true);
    };
  }, []);
  return (
    <div className="modal-backdrop panel-backdrop" onClick={close}>
      <div
        className="modal side-panel note-proposal-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-proposal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="note-proposal-title">Note</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer les propositions"
            onClick={close}
          >
            <Close size={17} />
          </button>
        </div>
        <div className="note-proposal-original">
          <small>VOTRE NOTE · TEXTE ORIGINAL</small>
          <p>{note.text}</p>
        </div>
        <p className="assistant-help">
          Les informations sont organisées automatiquement. Examinez les suites
          proposées à votre rythme.
        </p>
        {children}
      </div>
    </div>
  );
}
