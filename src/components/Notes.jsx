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
} from "../icons";
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
export default function Notes({ api, items, onError, onOpen }) {
  const [notes, setNotes] = useState([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(""),
    [view, setView] = useState("attention"),
    [group, setGroup] = useState("kind"),
    [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setNotes(await api("admin/notes"));
    } catch (e) {
      onError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("beam:notes", h);
    return () => window.removeEventListener("beam:notes", h);
  }, []);
  async function update(note, changes) {
    setBusy(true);
    try {
      await api("admin/notes/" + note.id, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      await load();
      setEditing(null);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const attention = (n) =>
    n.state === "open" && (["action", "followup"].includes(n.kind) || n.due);
  const clean = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const shown = notes
    .filter(
      (n) =>
        (view === "attention"
          ? attention(n)
          : view === "done"
            ? n.state === "done"
            : view === "archived"
              ? n.state === "archived"
              : n.state === "open") &&
        clean(
          [
            n.text,
            ...n.people,
            ...n.tags,
            ...n.linked.map(
              (id) => items.find((i) => i.id === id)?.title || "",
            ),
          ].join(" "),
        ).includes(clean(query)),
    )
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const groups = new Map();
  shown.forEach((n) => {
    const keys =
      group === "people"
        ? n.people.length
          ? n.people
          : ["Sans personne identifiée"]
        : group === "topic"
          ? [
              ...n.tags.map((t) => "#" + t),
              ...n.linked
                .map((id) => items.find((i) => i.id === id)?.title)
                .filter(Boolean),
            ].length
            ? [
                ...n.tags.map((t) => "#" + t),
                ...n.linked
                  .map((id) => items.find((i) => i.id === id)?.title)
                  .filter(Boolean),
              ]
            : ["Sans sujet identifié"]
          : [NOTE_KINDS[n.kind]];
    [...new Set(keys)].forEach((key) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    });
  });
  const today = new Date().toLocaleDateString("en-CA");
  return (
    <section className="notes-workspace">
      <div className="notes-intro">
        <FileText size={22} />
        <div>
          <strong>L’esprit libre, les suites au clair.</strong>
          <p>
            Classement suggéré à partir de vos mots, sans service IA externe.
            Corrigez-le à tout moment.
          </p>
        </div>
        <small className="notes-capture-shortcut">Capture rapide : ⌘⇧N</small>
      </div>
      <div className="notes-tools">
        <nav aria-label="Vues des notes">
          {[
            ["attention", "À suivre"],
            ["all", "Toutes les notes"],
            ["done", "Terminées"],
            ["archived", "Archives"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={"button " + (view === id ? "chosen" : "")}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
              {id === "attention" && (
                <span>{notes.filter(attention).length}</span>
              )}
            </button>
          ))}
        </nav>
        <label className="notes-search">
          <Search size={15} />
          <input
            aria-label="Rechercher dans les notes"
            placeholder="Personne, sujet, quelques mots…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Regrouper les notes"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="kind">Par intention</option>
          <option value="people">Par personne</option>
          <option value="topic">Par sujet</option>
        </select>
      </div>
      {loading ? (
        <div className="empty">Chargement des notes…</div>
      ) : !shown.length ? (
        <div className="notes-empty">
          <FileText size={30} />
          <h2>
            {notes.length
              ? "Rien ici pour le moment."
              : "Gardez le fil dès votre prochain échange."}
          </h2>
          <p>
            {view === "attention" && notes.length
              ? "Aucune action ou échéance identifiée. Vos autres notes sont dans « Toutes les notes »."
              : "Quelques mots suffisent. « Relancer Sarah demain », « Retour client #éditeur » ou une pensée libre."}
          </p>
        </div>
      ) : (
        [...groups].map(([name, list]) => (
          <section className="notes-group" key={name}>
            <h2>
              {name}
              <span>{list.length}</span>
            </h2>
            {list.map((n) => (
              <article className="note-card" key={n.id}>
                <div className="note-card-top">
                  <span className={"note-kind kind-" + n.kind}>
                    {NOTE_KINDS[n.kind]}
                  </span>
                  <time dateTime={n.created}>
                    {new Date(n.created).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                {editing?.id === n.id ? (
                  <form
                    className="note-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      update(n, {
                        text: editing.text,
                        classification: {
                          kind: editing.kind,
                          people: editing.people
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                          tags: editing.tags
                            .split(",")
                            .map((s) => s.trim().replace(/^#/, ""))
                            .filter(Boolean),
                          due: editing.due || null,
                          linked: editing.linked,
                        },
                      });
                    }}
                  >
                    <label>
                      Note
                      <textarea
                        autoFocus
                        value={editing.text}
                        maxLength={5000}
                        required
                        onChange={(e) =>
                          setEditing({ ...editing, text: e.target.value })
                        }
                      />
                    </label>
                    <div className="note-editor-grid">
                      <label>
                        Intention
                        <select
                          value={editing.kind}
                          onChange={(e) =>
                            setEditing({ ...editing, kind: e.target.value })
                          }
                        >
                          {Object.entries(NOTE_KINDS).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Échéance
                        <input
                          type="date"
                          value={editing.due || ""}
                          onChange={(e) =>
                            setEditing({ ...editing, due: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Personnes
                        <input
                          placeholder="Sarah, Thomas"
                          value={editing.people}
                          onChange={(e) =>
                            setEditing({ ...editing, people: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Sujets
                        <input
                          placeholder="éditeur, entretien"
                          value={editing.tags}
                          onChange={(e) =>
                            setEditing({ ...editing, tags: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Élément de roadmap
                      <select
                        value={editing.linked[0] || ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            linked: e.target.value ? [e.target.value] : [],
                          })
                        }
                      >
                        <option value="">Sans lien</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="note-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => setEditing(null)}
                      >
                        Annuler
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || !editing.text.trim()}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="note-text">{n.text}</p>
                    <div className="note-hints">
                      {n.people.map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setQuery(p);
                            setGroup("people");
                          }}
                        >
                          @{p}
                        </button>
                      ))}
                      {n.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setQuery(t);
                            setGroup("topic");
                          }}
                        >
                          #{t}
                        </button>
                      ))}
                      {n.due && (
                        <span
                          className={
                            n.due < today && n.state === "open"
                              ? "note-overdue"
                              : ""
                          }
                        >
                          {n.due < today && n.state === "open"
                            ? "À revoir · "
                            : ""}
                          {dateLabel(n.due)}
                        </span>
                      )}
                      {n.linked.map((id) => {
                        const item = items.find((i) => i.id === id);
                        return item ? (
                          <button key={id} onClick={() => onOpen(item)}>
                            <ArrowRight size={12} />
                            {item.title}
                          </button>
                        ) : null;
                      })}
                    </div>
                    <div className="note-actions">
                      <button
                        className="text-button"
                        onClick={() =>
                          setEditing({
                            ...n,
                            people: n.people.join(", "),
                            tags: n.tags.join(", "),
                          })
                        }
                      >
                        Modifier / classer
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          update(n, {
                            state: n.state === "open" ? "done" : "open",
                          })
                        }
                      >
                        <CheckCheck size={13} />
                        {n.state === "open" ? "Terminer" : "Réouvrir"}
                      </button>
                      {n.state !== "archived" && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => update(n, { state: "archived" })}
                        >
                          Archiver
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
