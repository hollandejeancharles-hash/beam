import React, { useState } from "react";
import { DemandCapture } from "./Demands";
import { conversionContext } from "../../shared/notebook-context";
export default function NoteConversion({
  note,
  type,
  catalog,
  active,
  api,
  onClose,
  onError,
  onDone,
}) {
  const initial = conversionContext(note, catalog, active, type);
  const [workspace, setWorkspace] = useState(initial.workspaceId),
    [parent, setParent] = useState(initial.parentId),
    [title, setTitle] = useState(
      note.text
        .split("\n")
        .find((l) => l.trim())
        ?.slice(0, 140) || "",
    ),
    [description, setDescription] = useState(note.excerpt || note.text),
    [busy, setBusy] = useState(false);
  const targetApi = (path, options = {}) =>
    api(path, {
      ...options,
      headers: { ...options.headers, "X-Beam-Workspace": workspace },
    });
  const selected = catalog.find((w) => w.id === workspace);
  const parents = (selected?.items || []).filter((i) =>
    type === "demand"
      ? true
      : type === "task"
        ? ["initiative", "project", "feature"].includes(i.type)
        : ["initiative", "project"].includes(i.type),
  );
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const latest = await targetApi("admin/items");
      if (parent && !latest.some((i) => i.id === parent))
        throw Error("Le rattachement a changé. Choisissez un autre élément.");
      const now = new Date();
      await targetApi("admin/items", {
        method: "POST",
        body: JSON.stringify({
          type,
          title,
          description,
          parent_id: parent || null,
          category: "Éditeur",
          priority: "medium",
          status: "planned",
          visibility: "private",
          quarter: `T${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
          _revision: latest[0]?._revision,
          _source_note_id: note.id,
        }),
      });
      onDone({ type, workspace });
      onClose();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const workspaceControl = (
    <label className="note-conversion-workspace">
      Workspace
      <select
        value={workspace}
        disabled={busy}
        onChange={(e) => {
          setWorkspace(e.target.value);
          setParent("");
        }}
      >
        {catalog.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <small>
        Seul le contenu ci-dessous sera utilisé pour créer l’élément.
      </small>
    </label>
  );
  return (
    <div
      className="demand-overlay note-conversion-overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onClose();
      }}
    >
      {type === "demand" ? (
        <div
          className="note-demand-context"
          role="dialog"
          aria-modal="true"
          aria-label="Préparer une demande"
        >
          {workspaceControl}
          <label className="note-conversion-workspace">
            Rattachement proposé
            <select
              value={parent}
              disabled={busy}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">Aucun</option>
              {parents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </label>
          <DemandCapture
            note={{
              ...note,
              text: note.excerpt || note.text,
              source_text: note.text,
              suggested_item_id: parent || null,
            }}
            api={targetApi}
            onBusyChange={setBusy}
            contextual
            onClose={onClose}
            onError={onError}
            onDone={() => {
              onDone({ type, workspace });
              onClose();
            }}
          />
        </div>
      ) : (
        <form
          className="note-conversion-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Créer une ${type === "task" ? "tâche" : "feature"}`}
          onSubmit={submit}
        >
          <div className="note-conversion-heading">
            <h2>Créer une {type === "task" ? "tâche" : "feature"}</h2>
            <button
              type="button"
              className="text-button"
              onClick={onClose}
              disabled={busy}
            >
              Fermer
            </button>
          </div>
          {workspaceControl}
          <label>
            Rattachement
            <select
              value={parent}
              disabled={busy}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">Élément indépendant</option>
              {parents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titre
            <input
              autoFocus
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              required
              rows={5}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <p className="subtle">
            Votre note reste personnelle et sera reliée à cet élément.
          </p>
          <button className="button primary" disabled={busy || !workspace}>
            {busy ? "Création…" : "Créer"}
          </button>
        </form>
      )}
    </div>
  );
}
