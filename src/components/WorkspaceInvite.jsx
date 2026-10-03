import React, { useEffect, useState } from "react";
import AccountAccess from "./ui/neural-access-login";
import { Copy, Link2, ArrowRight } from "../icons";
import { invitationLink } from "../../shared/invitations";
export default function WorkspaceInvite({ api, product, profile, onProfile }) {
  const [account, setAccount] = useState(null),
    [role, setRole] = useState("editor"),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [auth, setAuth] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    api("admin/collaboration")
      .then(setAccount)
      .catch((e) => setError(e.message));
  }, []);
  async function invite() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      let current = await api("admin/collaboration");
      setAccount(current);
      if (!current.signedIn) {
        setAuth(true);
        return;
      }
      if (!current.workspace) {
        current = await api("admin/collaboration", {
          method: "POST",
          body: JSON.stringify({ action: "create" }),
        });
        setAccount(current);
      }
      if (current.workspace.role !== "owner")
        throw Error("Seul l’administrateur peut inviter des personnes.");
      const result = await api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({ action: "invite", role }),
      });
      setLink(invitationLink(result.code));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-access">
      <div className="workspace-access-intro">
        <span className="workspace-access-icon">
          <Link2 size={22} />
        </span>
        <h3>Invitez quelqu’un dans {product.name}.</h3>
        <p>
          Un lien à transmettre. La personne l’ouvre et rejoint votre workspace.
        </p>
      </div>
      {auth ? (
        <>
          <p className="workspace-access-context">
            Connectez-vous pour partager ce workspace et créer votre invitation.
          </p>
          <AccountAccess
            compact
            initialMode="login"
            api={api}
            profile={profile}
            onProfile={onProfile}
            continueLabel="Créer mon invitation"
            onContinue={() => {
              setAuth(false);
              void invite();
            }}
          />
        </>
      ) : (
        <>
          {link ? (
            <>
              <label>
                Lien à transmettre
                <div className="copy-field">
                  <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                      } catch {
                        setError("Sélectionnez le lien pour le copier.");
                      }
                    }}
                  >
                    <Copy size={15} />
                    {copied ? "Copié" : "Copier le lien"}
                  </button>
                </div>
              </label>
              <p className="workspace-access-footnote">
                {role === "editor"
                  ? "Peut modifier le Gantt et le Kanban."
                  : "Peut consulter la roadmap."}{" "}
                Une personne · valable 7 jours.
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setLink("");
                  setCopied(false);
                }}
              >
                Inviter une autre personne
              </button>
            </>
          ) : (
            <>
              <label>
                Cette personne pourra
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="editor">Modifier la roadmap</option>
                  <option value="viewer">Consulter la roadmap</option>
                </select>
              </label>
              {!account?.workspace && (
                <p className="workspace-access-context">
                  La roadmap de {product.name} sera partagée. Vos notes et
                  documents restent sur ce Mac.
                </p>
              )}
              <button
                className="button primary workspace-access-submit"
                disabled={busy || !account}
                onClick={invite}
              >
                {busy
                  ? "Création du lien…"
                  : account?.workspace
                    ? "Créer un lien d’invitation"
                    : "Partager et inviter"}
                <ArrowRight size={16} />
              </button>
              <p className="workspace-access-footnote">
                Une invitation personnelle, valable 7 jours.
              </p>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="source-error">
          {error}
        </p>
      )}
    </div>
  );
}
