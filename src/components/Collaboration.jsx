import React, { useEffect, useState } from "react";
export default function Collaboration({ api, profile, onChange }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [spaces, setSpaces] = useState([]),
    [invite, setInvite] = useState("");
  const [url, setUrl] = useState("https://auerxzzdzhgawkcvqeiq.supabase.co"),
    [key, setKey] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("PULS"),
    [code, setCode] = useState(""),
    [share, setShare] = useState(false);
  useEffect(() => {
    api("admin/collaboration")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  async function action(action, values = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({ action, ...values }),
      });
      if (action === "list") setSpaces(r);
      else if (action === "invite") setInvite(r.code);
      else {
        setState(r);
        onChange?.();
        if (action === "team-profile")
          setMessage(
            "Votre nom et votre photo sont visibles par les membres de cet espace.",
          );
        if (r.confirmationRequired)
          setMessage("Confirmez votre adresse e-mail, puis connectez-vous.");
      }
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="collaboration-settings">
      <h3>Espace partagé</h3>
      <p className="modal-copy">
        Collaborez sur la même roadmap. Vos notes, documents et analyses restent
        sur ce Mac.
      </p>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!state ? (
        <p>Chargement…</p>
      ) : !state.configured ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action("configure", { url, key });
          }}
        >
          <label>
            URL du projet Supabase
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </label>
          <label>
            Clé publique publishable
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sb_publishable_…"
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Connecter le serveur
          </button>
        </form>
      ) : !state.signedIn ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action("login", { email, password });
          }}
        >
          <label>
            Votre e-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy || !email || password.length < 8}
              onClick={() => action("signup", { email, password })}
            >
              Créer mon compte
            </button>
            <button className="button primary" disabled={busy}>
              Se connecter
            </button>
          </div>
        </form>
      ) : state.workspace ? (
        <>
          <div className="shared-workspace-summary">
            <strong>{state.workspace.name}</strong>
            <span>
              {state.workspace.role === "owner"
                ? "Administrateur"
                : state.workspace.role === "viewer"
                  ? "Lecture seule"
                  : "Éditeur"}{" "}
              · {state.connected ? "Connecté" : "Reconnexion en cours"}
            </span>
            <small>{state.email}</small>
          </div>
          <p className="modal-copy">
            Les changements du Gantt et du Kanban sont partagés. Hors connexion,
            les modifications sont bloquées pour éviter les conflits.
          </p>
          <p className="modal-copy">
            Partagez votre nom et votre photo pour que l’équipe reconnaisse vos
            commentaires et vos modifications. Votre e-mail de profil reste
            local.
          </p>
          <button
            className="button"
            disabled={busy || !profile?.name?.trim()}
            onClick={() =>
              action("team-profile", {
                name: profile.name,
                photo: profile.photo,
              })
            }
          >
            Partager mon profil avec l’équipe
          </button>
          {!profile?.name?.trim() && (
            <small>
              Renseignez votre nom dans « Mon profil » pour vous présenter à
              l’équipe.
            </small>
          )}
          {state.workspace.role === "owner" && (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() => action("invite", { role: "editor" })}
              >
                Créer une invitation éditeur
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => action("invite", { role: "viewer" })}
              >
                Créer une invitation lecteur
              </button>
              {invite && (
                <label>
                  Code à transmettre · un usage · valable 7 jours
                  <textarea
                    readOnly
                    value={invite}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(invite);
                        setMessage(
                          "Invitation copiée. Transmettez-la à une seule personne.",
                        );
                      } catch {
                        setError(
                          "Sélectionnez le code puis copiez-le manuellement.",
                        );
                      }
                    }}
                  >
                    Copier l’invitation
                  </button>
                </label>
              )}
            </>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() => action("disconnect")}
          >
            Revenir à ma roadmap locale
          </button>
        </>
      ) : (
        <>
          <small>Connecté en tant que {state.email}</small>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action("create", { name, shareExisting: share });
            }}
          >
            <label>
              Nouvel espace
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <label className="shared-checkbox">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
              />
              Partager les éléments de ma roadmap actuelle
            </label>
            <small>
              Seuls les titres, descriptions et propriétés de la roadmap seront
              envoyés. Vos notes et documents restent privés.
            </small>
            <button className="button primary" disabled={busy}>
              Créer l’espace partagé
            </button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action("join", { code });
            }}
          >
            <label>
              Rejoindre avec une invitation
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                required
                placeholder="Code transmis par votre collègue"
              />
            </label>
            <button className="button" disabled={busy}>
              Rejoindre
            </button>
          </form>
          <button
            className="button"
            disabled={busy}
            onClick={() => action("list")}
          >
            Mes espaces
          </button>
          {spaces.map((w) => (
            <button
              key={w.id}
              className="button"
              disabled={busy}
              onClick={() => action("select", { id: w.id })}
            >
              {w.name}
            </button>
          ))}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => action("logout")}
          >
            Se déconnecter
          </button>
        </>
      )}
    </section>
  );
}
