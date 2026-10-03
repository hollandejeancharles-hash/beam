import React, { useEffect, useState } from "react";
import { Link2, ArrowRight } from "../icons";
import AccountAccess from "./ui/neural-access-login";
import { invitationCode } from "../../shared/invitations";
export default function JoinWorkspace({
  api,
  profile,
  onProfile,
  initialValue = "",
  onJoined,
}) {
  const [value, setValue] = useState(
    initialValue || sessionStorage.getItem("beam-pending-invitation") || "",
  );
  const [account, setAccount] = useState(null),
    [connecting, setConnecting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("admin/collaboration")
      .then(setAccount)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (value.trim()) sessionStorage.setItem("beam-pending-invitation", value);
    else sessionStorage.removeItem("beam-pending-invitation");
  }, [value]);
  async function join() {
    const code = invitationCode(value);
    if (!code) {
      setError(
        "Collez le lien d’invitation ou le code transmis par votre collègue.",
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      const current = await api("admin/collaboration");
      setAccount(current);
      if (!current.signedIn) {
        setConnecting(true);
        return;
      }
      const result = await api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({ action: "join", code }),
      });
      sessionStorage.removeItem("beam-pending-invitation");
      onJoined(result.localWorkspaceId);
    } catch (e) {
      setError(
        /expired|already used/i.test(e.message)
          ? "Ce lien a expiré ou a déjà été utilisé. Demandez une nouvelle invitation."
          : e.message,
      );
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
        <h3>Une invitation, et vous êtes dans l’équipe.</h3>
        <p>Collez votre lien. Beam ajoutera ce workspace à vos espaces.</p>
      </div>
      {connecting ? (
        <>
          <p className="workspace-access-context">
            Votre invitation est conservée. Connectez-vous pour rejoindre
            l’équipe.
          </p>
          <AccountAccess
            api={api}
            profile={profile}
            onProfile={onProfile}
            compact
            initialMode="login"
            continueLabel="Rejoindre le workspace"
            onContinue={() => {
              setConnecting(false);
              void join();
            }}
          />
          <button className="text-button" onClick={() => setConnecting(false)}>
            Changer l’invitation
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <label>
            Lien d’invitation
            <input
              autoFocus
              type="text"
              autoComplete="off"
              spellCheck="false"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              placeholder="Collez le lien reçu…"
              disabled={busy}
            />
          </label>
          {account?.signedIn && (
            <p className="workspace-access-context">
              Vous rejoignez avec {account.email}
            </p>
          )}
          <button
            className="button primary workspace-access-submit"
            disabled={busy || !value.trim()}
          >
            {busy ? "Connexion au workspace…" : "Rejoindre le workspace"}
            <ArrowRight size={16} />
          </button>
          <p className="workspace-access-footnote">
            Vos autres workspaces sont conservés. Vos notes restent sur ce Mac.
          </p>
        </form>
      )}
      {error && (
        <p className="source-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
