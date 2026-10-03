import { usePresenceActivity } from "./Team";
import React, { useEffect, useRef, useState } from "react";
import { useDraft } from "./Notes";
import { Close, ArrowRight, FileText } from "../icons";
export default function MenuBarCapture() {
  const [text, setText] = useDraft(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [workspace, setWorkspace] = useState(null);
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
    if (!r.ok) throw Error("Présence indisponible");
    return r.json();
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
    window.__beamFocusCapture = () => input.current?.focus();
    input.current?.focus();
    return () => {
      delete window.__beamFocusCapture;
    };
  }, []);
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);
  useEffect(() => {
    const apply = (state) =>
      setWorkspace(state.workspaces.find((w) => w.id === state.active));
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
      setText("");
      setMessage("Note enregistrée");
      input.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="menubar-capture">
      <header>
        <span>
          <FileText size={15} /> Nouvelle note
          <small className="capture-signature" title="Workspace actif">
            {workspace?.name || "beam"}
          </small>
        </span>
        <button
          className="icon-button"
          aria-label="Fermer la capture"
          onClick={close}
        >
          <Close size={17} />
        </button>
      </header>
      <form onSubmit={save}>
        <textarea
          ref={input}
          aria-label="Votre note"
          placeholder="Une note, simplement.
Une pensée, un échange, une suite à donner…"
          value={text}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
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
