import React, { useState } from "react";
export const initials = (name) =>
  name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "U";
export default function Workspace({ product, api, onSave, onClose }) {
  const [draft, setDraft] = useState({
      name: product.name,
      description: product.description ?? "Product workspace",
      photo: product.image || null,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function photo(file) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError("Choisissez une image PNG, JPEG ou WebP de moins de 8 Mo.");
      return;
    }
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const size = Math.min(image.width, image.height);
      canvas
        .getContext("2d")
        .drawImage(
          image,
          (image.width - size) / 2,
          (image.height - size) / 2,
          size,
          size,
          0,
          0,
          256,
          256,
        );
      image.close();
      setDraft((d) => ({ ...d, photo: canvas.toDataURL("image/png") }));
    } catch {
      setError("Cette image ne peut pas être lue.");
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const value = await api("admin/product", {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          image: draft.photo,
        }),
      });
      onSave(value);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="user-profile-form" onSubmit={save}>
      <p className="assistant-help">
        Le nom et l’image identifient votre produit dans Beam et sur sa roadmap
        publique.
      </p>
      <div className="user-profile-photo">
        <span className="avatar">
          {draft.photo ? (
            <img src={draft.photo} alt="Aperçu du workspace" />
          ) : (
            initials(draft.name)
          )}
        </span>
        <div>
          <label className="button attachment-picker">
            Changer l’image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                photo(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </label>
          {draft.photo && (
            <button
              type="button"
              className="text-button"
              onClick={() => setDraft({ ...draft, photo: null })}
            >
              Retirer l’image
            </button>
          )}
          <small>PNG, JPEG ou WebP · Recadrage centré</small>
        </div>
      </div>
      <label>
        Nom affiché
        <input
          required
          maxLength={80}
          placeholder="PULS"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        Description courte
        <input
          maxLength={160}
          placeholder="Product workspace"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="source-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Annuler
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
