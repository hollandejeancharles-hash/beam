import { invitationLink } from "../../shared/invitations";
import React, { useEffect, useState } from "react";
import AccountAccess from "./ui/neural-access-login";
export default function Collaboration({
  api,
  profile,
  onChange,
  onAccount,
  product = { name: "Votre workspace" },
}) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [spaces, setSpaces] = useState([]),
    [invite, setInvite] = useState("");
  const [url, setUrl] = useState("https://auerxzzdzhgawkcvqeiq.supabase.co"),
    [key, setKey] = useState(""),
    [code, setCode] = useState("");
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
        if (r.localWorkspaceId) {
          const params = new URLSearchParams(location.search);
          params.set("workspace", r.localWorkspaceId);
          location.assign(location.pathname + "?" + params + location.hash);
          return;
        }
        setState(r);
        onChange?.();
        if (action === "team-profile")
          setMessage(
            "Votre nom et votre photo sont visibles par les membres de cet espace.",
          );
        if (r.confirmationRequired)
          setMessage("Confirmez votre adresse e-mail, puis connectez-vous.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="collaboration-settings">
      <h3>Collaboration</h3>
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
        onAccount ? (
          <div className="workspace-team-connect">
            <span className="workspace-section-label">WORKSPACE PERSONNEL</span>
            <h4>Votre équipe, sur la même roadmap.</h4>
            <p>
              Connectez votre compte Beam pour partager ce workspace ou
              rejoindre une équipe dans un autre workspace.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={onAccount}
            >
              Connecter mon compte <span aria-hidden="true">→</span>
            </button>
            <small>
              Vous travaillez actuellement sur la roadmap locale de ce Mac.
            </small>
          </div>
        ) : (
          <AccountAccess
            compact
            api={api}
            profile={profile}
            onContinue={async () => {
              setState(await api("admin/collaboration"));
              onChange?.();
            }}
          />
        )
      ) : state.workspace ? (
        <>
          <div className="shared-workspace-summary">
            <strong>{product.name}</strong>
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
            Votre nom et votre photo suivent votre profil Beam dans vos équipes.
            Modifiez-les depuis « Mon profil ».
          </p>
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
                  Lien à transmettre · une personne · valable 7 jours
                  <textarea
                    readOnly
                    value={invitationLink(invite)}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          invitationLink(invite),
                        );
                        setMessage(
                          "Lien copié. La personne l’ouvre pour rejoindre votre workspace.",
                        );
                      } catch {
                        setError(
                          "Sélectionnez le code puis copiez-le manuellement.",
                        );
                      }
                    }}
                  >
                    Copier le lien
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
            Désactiver le partage de ce workspace
          </button>
        </>
      ) : (
        <>
          <small>Connecté en tant que {state.email}</small>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action("create", { name: product.name, shareExisting: true });
            }}
          >
            <strong>Partager {product.name}</strong>
            <p className="modal-copy">
              Ce workspace garde son nom et ses éléments. Sa roadmap devient
              commune à votre équipe.
            </p>
            <small>
              Seuls les titres, descriptions et propriétés de la roadmap seront
              envoyés. Vos notes et documents restent privés.
            </small>
            <button className="button primary" disabled={busy}>
              Activer la collaboration
            </button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action("join", { code });
            }}
          >
            <label>
              Rejoindre une équipe · nouveau workspace
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
            Retrouver mes workspaces partagés
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
        </>
      )}
    </section>
  );
}
