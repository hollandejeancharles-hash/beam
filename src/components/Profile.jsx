import React, { useEffect, useState } from "react";
export const initials = (name) =>
  name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "U";
export default function Profile({
  profile,
  api,
  onSave,
  onClose,
  saveLabel = "Enregistrer",
  cancelLabel = "Annuler",
  onAccount,
}) {
  const [draft, setDraft] = useState({ ...profile }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [account, setAccount] = useState(null);
  useEffect(() => {
    if (onAccount)
      api("admin/collaboration")
        .then(setAccount)
        .catch(() => setAccount({ unavailable: true }));
  }, []);
  const dirty = ["name", "role", "email", "photo"].some(
    (key) => (draft[key] || "") !== (profile[key] || ""),
  );
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
      const value = await api("admin/profile", {
        method: "PATCH",
        body: JSON.stringify(draft),
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
      <div className="profile-intro">
        <span className="profile-overline">VOTRE ESPACE PERSONNEL</span>
        <h3>Votre identité dans Beam.</h3>
        <p>Personnalisez votre photo et vos informations.</p>
      </div>
      <div className="user-profile-photo">
        <span className="avatar">
          {draft.photo ? (
            <img src={draft.photo} alt="Aperçu de votre photo" />
          ) : (
            initials(draft.name)
          )}
        </span>
        <div className="profile-photo-content">
          <strong className="profile-preview-name">
            {draft.name?.trim() || "Votre nom"}
          </strong>
          <span className="profile-preview-role">
            {draft.role?.trim() || "Votre rôle dans l’équipe"}
          </span>
          <div className="profile-photo-actions">
            <label className="button attachment-picker">
              Changer la photo
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
                Retirer la photo
              </button>
            )}
          </div>
          <small>PNG, JPEG ou WebP · 8 Mo maximum</small>
        </div>
      </div>
      <div className="profile-fields-heading">Informations personnelles</div>
      <label>
        Nom affiché
        <input
          autoComplete="name"
          maxLength={80}
          placeholder="Votre nom"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        Rôle dans l’équipe
        <input
          maxLength={100}
          placeholder="Product Manager, Product Owner…"
          value={draft.role}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
        />
      </label>
      <label>
        Email <span className="subtle">facultatif</span>
        <input
          type="email"
          autoComplete="email"
          maxLength={180}
          placeholder="vous@entreprise.fr"
          value={draft.email}
          onChange={(e) => setDraft({ ...draft, email: e.target.value })}
        />
      </label>
      <p className="profile-contact-help">
        Cet e-mail est une information de profil. Il ne modifie pas votre
        adresse de connexion.
      </p>
      <div className="profile-privacy-note">
        <span className="profile-privacy-dot" aria-hidden="true" />
        <p>
          Conservé sur ce Mac
          <span>
            Votre nom et votre photo ne sont partagés que lorsque vous
            choisissez de les partager avec une équipe.
          </span>
        </p>
      </div>
      {onAccount && (
        <section className="profile-account-section">
          <div>
            <span className="profile-overline">COMPTE BEAM</span>
            <h4>
              {account?.signedIn
                ? "Votre compte est connecté"
                : "Collaborez avec votre équipe"}
            </h4>
            <p>
              {account?.signedIn
                ? account.email
                : "Un compte pour accéder aux espaces partagés."}
            </p>
          </div>
          <button
            type="button"
            className="profile-account-link"
            disabled={dirty || busy}
            onClick={onAccount}
          >
            {account?.signedIn ? "Gérer" : "Se connecter"}
            <span aria-hidden="true">→</span>
          </button>
          {dirty && (
            <small>
              Enregistrez vos modifications avant d’ouvrir votre compte.
            </small>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="source-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="button" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          className="button primary"
          disabled={busy || (!!onAccount && !dirty)}
        >
          {busy ? "Enregistrement…" : saveLabel}
        </button>
      </div>
    </form>
  );
}
