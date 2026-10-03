import { usePresenceActivity } from "./Team";
import React, { useEffect, useRef, useState } from "react";
import Notes, { useDraft } from "./Notes";
import { Close, ArrowRight, FileText, ArrowUpRight } from "../icons";
export default function MenuBarCapture() {
  const [workspace, setWorkspace] = useState(null);
  const [text, setText] = useDraft(workspace?.id),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const pinnedWorkspace = useRef(false);
  const [notebookOpened, setNotebookOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState(null);
  const [captureDraft, setCaptureDraft] = useState(null);
  const [items, setItems] = useState([]);
  const [lastSaved, setLastSaved] = useState(null);
  const [presenceState, setPresenceState] = useState(null);
  const captureApi = async (path, options = {}) => {
    const r = await fetch(
      "/api/" +
        path +
        "?workspace=" +
        encodeURIComponent(workspace?.id || "default"),
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
        },
      },
    );
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Impossible de charger le carnet.");
    return data;
  };
  useEffect(() => {
    if (!workspace?.id) return;
    let alive = true;
    captureApi("admin/collaboration")
      .then((s) => {
        if (alive) setPresenceState(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspace?.id]);
  usePresenceActivity(captureApi, presenceState, "notes");
  const input = useRef(null);
  const close = () =>
    window.webkit?.messageHandlers?.beamCapture?.postMessage("close");
  useEffect(() => {
    window.__beamFocusCapture = () => expanded ? document.querySelector(".capture-notebook .notebook-detail textarea")?.focus() : input.current?.focus();
    input.current?.focus();
    return () => {
      delete window.__beamFocusCapture;
    };
  }, [expanded]);
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);
  useEffect(() => {
    const apply = (state) => {
      if (!pinnedWorkspace.current) setWorkspace(state.workspaces.find((w) => w.id === state.active));
    };
    fetch("/api/admin/workspaces", {
      headers: {
        Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
      },
    })
      .then((r) => r.json())
      .then(apply)
      .catch(() => {});
    const events = new EventSource("/api/admin/workspaces/events");
    events.onmessage = (event) => apply(JSON.parse(event.data));
    return () => events.close();
  }, []);
  async function save(e) {
    e?.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const access = {
        Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
      };
      const workspaceResponse = await fetch("/api/admin/workspaces", {
        headers: access,
      });
      const workspaceState = await workspaceResponse.json();
      if (!workspaceResponse.ok) throw Error(workspaceState.error);
      if (workspace && workspace.id !== workspaceState.active) {
        setWorkspace(
          workspaceState.workspaces.find((w) => w.id === workspaceState.active),
        );
        throw Error(
          "Le workspace a changé. Vérifiez son nom avant d’enregistrer.",
        );
      }
      const response = await fetch("/api/admin/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Beam-Workspace": workspaceState.active,
          Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
        },
        body: JSON.stringify({ text }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Impossible d’enregistrer la note.");
      setLastSaved({ id: result.id, workspaceId: workspaceState.active });
      setText("");
      setMessage("Note enregistrée");
      input.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function expand() {
    if (busy || !workspace) return;
    try {
      const bridge = window.webkit?.messageHandlers?.beamCapture;
      const payload = { action: "expand", workspaceId: workspace.id };
      if (!text.trim() && lastSaved?.workspaceId === workspace.id)
        payload.noteId = lastSaved.id;
      else {
        payload.transferId = crypto.randomUUID();
        localStorage.setItem(
          "beam-note-transfer:" + payload.transferId,
          JSON.stringify({ workspaceId: workspace.id, text }),
        );
      }
      const url = new URL(location.href);
      url.searchParams.set("workspace", workspace.id);
      history.replaceState(null, "", url.pathname + url.search);
      setTarget(payload.noteId ? { kind: "note", id: payload.noteId, targetId: payload.noteId } : { kind: "capture", id: payload.transferId });
      pinnedWorkspace.current = true;
      setNotebookOpened(true);
      setExpanded(true);
      setError("");
      bridge?.postMessage({ action: "resize", mode: "notebook" });
      captureApi("admin/items").then(setItems).catch(() => {});
    } catch (e) {
      setError("Impossible d’agrandir la note. Votre brouillon est conservé.");
    }
  }
  return (
    <main className={`menubar-capture ${expanded ? "capture-notebook" : ""}`}>
      <header>
        <span>
          <FileText size={15} /> {expanded ? "Carnet" : "Nouvelle note"}
          <small className="capture-signature" title="Workspace actif">
            {workspace?.name || "beam"}
          </small>
        </span>
        <div className="capture-window-actions">
          <button
            className="icon-button"
            aria-label={expanded ? "Réduire la fenêtre" : "Agrandir en mode carnet"}
            title={expanded && captureDraft?.hasFiles ? "Enregistrez les pièces jointes avant de réduire" : expanded ? "Réduire la fenêtre" : "Agrandir en mode carnet"}
            disabled={busy || !workspace || (expanded && (captureDraft?.hasFiles || captureDraft?.busy))}
            onClick={() => {
              if (!expanded) return expand();
              setText(captureDraft?.composing ? captureDraft.text : "");
              setLastSaved(null);
              setExpanded(false);
              window.webkit?.messageHandlers?.beamCapture?.postMessage({ action: "resize", mode: "quick" });
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <span className={expanded ? "capture-shrink-icon" : ""}><ArrowUpRight size={17} /></span>
          </button>
          <button
            className="icon-button"
            aria-label="Fermer la capture"
            onClick={close}
          >
            <Close size={17} />
          </button>
        </div>
      </header>
      {notebookOpened ? <div hidden={!expanded} className="capture-notebook-content">
        <Notes api={captureApi} items={items} initialTarget={target} onTargetConsumed={() => setTarget(null)} onError={setError} onCaptureDraft={setCaptureDraft} onRefresh={() => captureApi("admin/items").then(setItems)} onOpen={() => setError("Les détails de la roadmap sont disponibles dans la fenêtre principale de Beam.")} onPrepare={() => setError("La création d’un élément de roadmap est disponible dans la fenêtre principale de Beam.")} />
        {error && <p role="alert">{error}</p>}
      </div> : null}
      <form onSubmit={save} hidden={expanded}>
        <textarea
          ref={input}
          aria-label="Votre note"
          placeholder="Une note, simplement.
Une pensée, un échange, une suite à donner…"
          value={text}
          disabled={busy || !workspace}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
            setLastSaved(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="menubar-capture-footer">
          <small>⌘ Entrée pour enregistrer</small>
          <button className="button primary" disabled={busy || !text.trim()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
            <ArrowRight size={14} />
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : <p role="status">{message}</p>}
      </form>
    </main>
  );
}
