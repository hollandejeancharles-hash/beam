import { usePresenceActivity } from "./Team";
import React, { useEffect, useRef, useState } from "react";
const RichNoteEditor = React.lazy(() => import("./RichNoteEditor"));
import Notes, { useDraft } from "./Notes";
import { Close, ArrowRight, FileText, ArrowUpRight } from "../icons";
export default function MenuBarCapture() {
  const [document, setDocument] = useState(() => {try {return JSON.parse(localStorage.getItem("beam-quick-note-document") || "null");} catch {return null;}});
  useEffect(() => {if(document) localStorage.setItem("beam-quick-note-document", JSON.stringify(document)); else localStorage.removeItem("beam-quick-note-document");}, [document]);
  const [captureSession, setCaptureSession] = useState("initial");
  const [files, setFiles] = useState([]);
  const [catalog, setCatalog] = useState([]);
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
  useEffect(() => {
    captureApi("admin/notebook/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, []);
  const input = useRef(null);
  const documentFocus = () =>
    window.document
      .querySelector('.menubar-capture>form [contenteditable="true"]')
      ?.focus();
  const close = () =>
    window.webkit?.messageHandlers?.beamCapture?.postMessage("close");
  useEffect(() => {
    window.__beamFocusCapture = () =>
      expanded
        ? window.document
            .querySelector(
              '.capture-notebook .notebook-detail [contenteditable="true"], .capture-notebook .notebook-detail textarea',
            )
            ?.focus()
        : documentFocus();
    documentFocus();
    return () => {
      delete window.__beamFocusCapture;
    };
  }, [expanded]);
  useEffect(() => {
    if (!busy) documentFocus();
  }, [busy]);
  useEffect(() => {
    const apply = (state) => {
      if (!pinnedWorkspace.current)
        setWorkspace(state.workspaces.find((w) => w.id === state.active));
    };
    fetch("/api/admin/workspaces", {
      headers: {
        Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
      },
    })
      .then((r) => r.json())
      .then(apply)
      .catch(() => {});
    const refresh = () => {if(!window.document.hidden) fetch("/api/admin/workspaces", {headers:{Authorization:"Bearer " + (sessionStorage.getItem("beam_key") || "")}}).then(r=>r.json()).then(apply).catch(()=>{});};
    const timer=setInterval(refresh, 15000);
    window.document.addEventListener("visibilitychange", refresh);
    return () => {clearInterval(timer); window.document.removeEventListener("visibilitychange",refresh);};
  }, []);
  async function save(e, snapshot, commandType) {
    e?.preventDefault();
    const value = snapshot?.text ?? text;
    const doc = snapshot?.document ?? document;
    if (busy || (!value.trim() && !files.length)) return;
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
        body: JSON.stringify({
          text: value || files.map((f) => f.name).join(", "),
          document: doc,
          workspace_ids: [],
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Impossible d’enregistrer la note.");
      for (const file of files) {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await captureApi(`admin/notes/${result.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ name: file.name, mime: file.type, data }),
        });
      }
      setFiles([]);
      setLastSaved({ id: result.id, workspaceId: workspaceState.active });
      setText("");
      setDocument(null);
      if (commandType) {
        setCaptureSession(result.id);
        setTarget({ kind: "note", id: result.id, commandType });
        setNotebookOpened(true);
        setExpanded(true);
        captureApi("admin/items")
          .then(setItems)
          .catch(() => {});
        window.webkit?.messageHandlers?.beamCapture?.postMessage({
          action: "resize",
          mode: "notebook",
        });
      }
      setMessage("Note enregistrée");
      documentFocus();
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
          JSON.stringify({ workspaceId: workspace.id, text, document }),
        );
      }
      const url = new URL(location.href);
      url.searchParams.set("workspace", workspace.id);
      history.replaceState(null, "", url.pathname + url.search);
      setTarget(
        payload.noteId
          ? { kind: "note", id: payload.noteId, targetId: payload.noteId }
          : { kind: "capture", id: payload.transferId },
      );
      pinnedWorkspace.current = true;
      setNotebookOpened(true);
      setExpanded(true);
      setError("");
      bridge?.postMessage({ action: "resize", mode: "notebook" });
      captureApi("admin/items")
        .then(setItems)
        .catch(() => {});
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
            aria-label={
              expanded ? "Réduire la fenêtre" : "Agrandir en mode carnet"
            }
            title={
              expanded && captureDraft?.hasFiles
                ? "Enregistrez les pièces jointes avant de réduire"
                : expanded
                  ? "Réduire la fenêtre"
                  : "Agrandir en mode carnet"
            }
            disabled={
              busy ||
              files.length > 0 ||
              !workspace ||
              (expanded && (captureDraft?.hasFiles || captureDraft?.busy))
            }
            onClick={() => {
              if (!expanded) return expand();
              setText(captureDraft?.composing ? captureDraft.text : "");
              setDocument(
                captureDraft?.composing ? captureDraft.document : null,
              );
              setLastSaved(null);
              setExpanded(false);
              window.webkit?.messageHandlers?.beamCapture?.postMessage({
                action: "resize",
                mode: "quick",
              });
              requestAnimationFrame(() => documentFocus());
            }}
          >
            <span className={expanded ? "capture-shrink-icon" : ""}>
              <ArrowUpRight size={17} />
            </span>
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
      {notebookOpened ? (
        <div hidden={!expanded} className="capture-notebook-content">
          <Notes
            key={captureSession}
            api={captureApi}
            items={items}
            initialTarget={target}
            onTargetConsumed={() => setTarget(null)}
            onError={setError}
            onCaptureDraft={setCaptureDraft}
            onRefresh={() => captureApi("admin/items").then(setItems)}
            onOpen={() =>
              setError(
                "Les détails de la roadmap sont disponibles dans la fenêtre principale de Beam.",
              )
            }
            onPrepare={() =>
              setError(
                "La création d’un élément de roadmap est disponible dans la fenêtre principale de Beam.",
              )
            }
          />
          {error && <p role="alert">{error}</p>}
        </div>
      ) : null}
      <form onSubmit={save} hidden={expanded}>
        <React.Suspense fallback={<p>Ouverture de la note…</p>}>
          <RichNoteEditor
            text={text}
            document={document}
            catalog={catalog}
            autoFocus
            readOnly={busy || !workspace}
            onChange={({ text, document }) => {
              setText(text);
              setDocument(document);
              setMessage("");
              setLastSaved(null);
            }}
            onSave={(snapshot) => save(null, snapshot)}
            onCommand={(type, snapshot) => save(null, snapshot, type)}
            onFiles={(chosen) =>
              setFiles((previous) => [...previous, ...Array.from(chosen)])
            }
          />
        </React.Suspense>
        {files.length > 0 && <small>{files.length} fichier(s) à joindre</small>}
        <div className="menubar-capture-footer">
          <small>⌘ Entrée pour enregistrer</small>
          <button
            className="button primary"
            disabled={busy || (!text.trim() && !files.length)}
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
            <ArrowRight size={14} />
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : <p role="status">{message}</p>}
      </form>
    </main>
  );
}
