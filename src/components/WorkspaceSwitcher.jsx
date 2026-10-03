import { createPortal } from "react-dom";
import React, { useState, useRef } from "react";
import { Plus, CheckCheck, SlidersHorizontal, ChevronDown } from "../icons";
export default function WorkspaceSwitcher({ state, product, api, onSettings }) {
  const trigger = useRef(null);
  const [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(path, body) {
    setBusy(true);
    setError("");
    try {
      const next = await api(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const params = new URLSearchParams(location.search);
      params.set("workspace", next.active);
      location.assign(location.pathname + "?" + params + location.hash);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="workspace-switcher">
      <button
        type="button"
        className="workspace"
        ref={trigger}
        aria-label="Changer de workspace"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setError("");
        }}
      >
        <span className="puls-logo">
          {product.image ? (
            <img src={product.image} alt="" />
          ) : (
            product.name?.[0]?.toUpperCase()
          )}
        </span>
        <div>
          <strong>{product.name}</strong>
          <small>{product.description || "Product workspace"}</small>
        </div>
        <ChevronDown size={14} />
      </button>
      {open &&
        createPortal(
          <>
            <button
              className="workspace-picker-dismiss"
              aria-label="Fermer le sélecteur"
              onClick={() => setOpen(false)}
            />
            <div
              className="workspace-picker"
              style={{
                left: Math.max(
                  12,
                  trigger.current?.getBoundingClientRect().left || 12,
                ),
                top:
                  (trigger.current?.getBoundingClientRect().bottom || 135) + 6,
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            >
              <div className="workspace-picker-heading">
                Vos workspaces
                <button
                  className="icon-button"
                  aria-label="Fermer"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="workspace-picker-list">
                {state?.workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={busy}
                    aria-current={w.id === state.active ? "true" : undefined}
                    onClick={() =>
                      w.id === state.active
                        ? setOpen(false)
                        : run("admin/workspaces/select", { id: w.id })
                    }
                  >
                    <span className="workspace-picker-avatar">
                      {w.image ? (
                        <img src={w.image} alt="" />
                      ) : (
                        w.name[0].toUpperCase()
                      )}
                    </span>
                    <span>
                      <strong>{w.name}</strong>
                      <small>
                        {w.shared ? "Espace partagé" : "Sur ce Mac"}
                      </small>
                    </span>
                    {w.id === state.active && <CheckCheck size={14} />}
                  </button>
                ))}
              </div>
              <div className="workspace-picker-tools">
                <button
                  onClick={() => {
                    setOpen(false);
                    onSettings();
                  }}
                >
                  <SlidersHorizontal size={14} />
                  Réglages du workspace
                </button>
                <button onClick={() => setCreating(!creating)}>
                  <Plus size={14} />
                  Nouveau workspace
                </button>
              </div>
              {creating && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("admin/workspaces", { name });
                  }}
                >
                  <label>
                    Nom du workspace
                    <input
                      autoFocus
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Un produit, un projet, un sujet…"
                      disabled={busy}
                    />
                  </label>
                  <small>La roadmap et les notes démarrent vides.</small>
                  <button
                    className="button primary"
                    disabled={busy || !name.trim()}
                  >
                    {busy ? "Création…" : "Créer le workspace"}
                  </button>
                </form>
              )}
              {error && (
                <p role="alert" className="source-error">
                  {error}
                </p>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
