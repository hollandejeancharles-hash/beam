import React, { useEffect, useState } from "react";

// Adapted from the supplied Mercury design; authentication uses Beam's local API.
export default function AccountAccess({
  api,
  profile,
  onProfile,
  onContinue,
  onLocal,
  compact = false,
  initialMode = "signup",
  continueLabel = "Revenir à Beam",
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  useEffect(() => {
    api("admin/collaboration")
      .then(setState)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (mode === "signup" && !name.trim()) {
      setError("Indiquez votre nom pour continuer.");
      return;
    }
    if (mode === "signup" && password !== confirmation) {
      setError("Les deux mots de passe doivent être identiques.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({
          action: mode === "signup" ? "signup" : "login",
          email: email.trim(),
          password,
        }),
      });
      setState(result);
      setPassword("");
      setConfirmation("");
      if (result.confirmationRequired) {
        setPendingEmail(email.trim());
        setMode("login");
      }
      if (mode === "signup") {
        // Only the display profile is stored here, never the password.
        const saved = await api("admin/profile", {
          method: "PATCH",
          body: JSON.stringify({
            ...profile,
            name: name.trim(),
            email: email.trim(),
          }),
        });
        onProfile?.(saved);
      }
      if (!result.confirmationRequired) onContinue?.();
    } catch (e) {
      const messages = {
        "Invalid login credentials":
          "L’adresse e-mail ou le mot de passe est incorrect.",
        "Email not confirmed":
          "Confirmez votre adresse e-mail avant de vous connecter.",
        "User already registered":
          "Un compte existe déjà avec cette adresse. Connectez-vous.",
        "Failed to fetch":
          "Connexion impossible. Vérifiez votre accès à Internet puis réessayez.",
      };
      setError(messages[e.message] || e.message);
    } finally {
      setBusy(false);
    }
  }
  function changeMode() {
    setMode(mode === "signup" ? "login" : "signup");
    setError("");
    setPassword("");
    setConfirmation("");
  }
  return (
    <div className={"beam-account " + (compact ? "beam-account-compact" : "")}>
      {!compact && (
        <div className="beam-mercury" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ "--orb": i } as React.CSSProperties} />
          ))}
        </div>
      )}
      <main className="beam-account-card">
        <div className="beam-account-brand" aria-label="Beam">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path
              d="M5 28 17 8h6L11 28zm10 4L29 8h6L21 32z"
              fill="currentColor"
            />
          </svg>
          <span>beam.</span>
        </div>
        <header>
          <p className="beam-account-kicker">UNE PLACE POUR VOS IDÉES</p>
          <h1>
            {state?.signedIn ? (
              "Vous êtes chez vous."
            ) : pendingEmail ? (
              "Encore un petit pas."
            ) : mode === "signup" ? (
              <>
                Tout commence
                <br />
                par une idée.
              </>
            ) : (
              "Heureux de vous revoir."
            )}
          </h1>
          <p>
            {state?.signedIn
              ? `Connecté avec ${state.email}`
              : "Votre roadmap, vos échanges, votre équipe. Un seul espace pour avancer."}
          </p>
        </header>
        {pendingEmail && !state?.signedIn && (
          <div className="beam-account-notice" role="status">
            Un e-mail de confirmation a été demandé pour{" "}
            <strong>{pendingEmail}</strong>. Vérifiez votre boîte de réception
            et vos indésirables, confirmez votre adresse, puis connectez-vous
            ici.
          </div>
        )}
        {error && (
          <p className="beam-account-error" role="alert">
            {error}
          </p>
        )}
        {!state && !error && <p role="status">Préparation de votre espace…</p>}
        {state?.signedIn ? (
          <div>
            <button className="beam-account-submit" onClick={onContinue}>
              {continueLabel} <span aria-hidden="true">→</span>
            </button>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  const next = await api("admin/collaboration", {
                    method: "POST",
                    body: JSON.stringify({ action: "logout" }),
                  });
                  setState(next);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Se déconnecter de Beam sur ce Mac
            </button>
            <p className="modal-copy">
              Vos workspaces sont conservés. La modification des roadmaps
              partagées nécessite une connexion.
            </p>
          </div>
        ) : state?.configured ? (
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Votre nom
                <input
                  required
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Comment vous appeler ?"
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Adresse e-mail
              <input
                required
                type="email"
                autoComplete="username"
                maxLength={180}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@entreprise.fr"
                disabled={busy}
              />
            </label>
            <label>
              Mot de passe
              <div className="beam-password">
                <input
                  required
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  disabled={busy}
                />
                <button
                  type="button"
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Masquer" : "Afficher"}
                </button>
              </div>
            </label>
            {mode === "signup" && (
              <label>
                Confirmer le mot de passe
                <input
                  required
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Une seconde fois"
                  disabled={busy}
                />
              </label>
            )}
            <button className="beam-account-submit" disabled={busy}>
              {busy
                ? "Un instant…"
                : mode === "signup"
                  ? "Créer mon compte"
                  : "Se connecter"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="beam-account-switch">
              {mode === "signup" ? "Déjà un compte ?" : "Première visite ?"}{" "}
              <button type="button" disabled={busy} onClick={changeMode}>
                {mode === "signup" ? "Se connecter" : "Créer mon compte"}
              </button>
            </p>
          </form>
        ) : (
          state && (
            <p className="beam-account-notice">
              Le service de compte n’est pas configuré. Vous pouvez commencer
              sur ce Mac et connecter une équipe dans les réglages du workspace.
            </p>
          )
        )}
        {onLocal && (
          <button
            className="beam-account-local"
            disabled={busy}
            onClick={onLocal}
          >
            Commencer sans compte, sur ce Mac
          </button>
        )}
        <footer>
          Le compte partage votre roadmap avec votre équipe.
          <br />
          Vos notes, documents et analyses IA restent sur ce Mac.
        </footer>
      </main>
    </div>
  );
}
