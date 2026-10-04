import React, { useEffect, useState } from "react";
export default function LocalAISetup({ api, showReady = false }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let alive = true;
    const update = () =>
      api("admin/ai/setup")
        .then((s) => {
          if (alive) {
            setStatus(s);
            if (s.state === "ready") setEnabled(true);
          }
        })
        .catch(() => {});
    update();
    api("admin/ai/status")
      .then((s) => {
        if (alive) setEnabled(s.enabled);
      })
      .catch(() => {});
    const timer = setInterval(update, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!status)
    return <p className="modal-copy">Vérification de l’assistant local…</p>;
  if (status.installed)
    return showReady ? (
      <section className="collaboration-settings local-ai-setup">
        <h3>Votre assistant est prêt</h3>
        <p className="modal-copy">
          Le modèle IA est installé sur ce Mac.{" "}
          {enabled
            ? "L’organisation automatique de vos notes est active."
            : "Activez l’organisation automatique pour classer vos notes et extraire des sujets."}
        </p>
        {enabled === false && (
          <button
            className="button"
            onClick={async () => {
              try {
                await api("admin/ai/settings", {
                  method: "PATCH",
                  body: JSON.stringify({ enabled: true }),
                });
                setEnabled(true);
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Activer l’organisation automatique
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    ) : null;
  const busy = status.state === "downloading",
    percent = status.total
      ? Math.floor((status.completed / status.total) * 100)
      : null;
  return (
    <section className="collaboration-settings local-ai-setup">
      <h3>Installer l’assistant local</h3>
      <p className="modal-copy">
        Le moteur est inclus dans Beam. Téléchargez le modèle une fois (environ
        6 Go) pour analyser vos notes et documents sur ce Mac, sans abonnement.
      </p>
      {status.memoryGB < 16 && (
        <p>
          Ce Mac dispose de {status.memoryGB} Go de mémoire. L’analyse peut être
          lente ; 16 Go ou plus sont recommandés.
        </p>
      )}
      {busy ? (
        <div className="local-ai-download" aria-live="polite">
          <p role="status">
            {percent === 100
              ? "Vérification du modèle"
              : "Téléchargement du modèle"}
            {percent !== null ? " · " + percent + " %" : ""}
          </p>
          {percent !== null && (
            <progress
              aria-label="Téléchargement du modèle IA"
              value={status.completed}
              max={status.total}
            />
          )}
          <small>
            Le téléchargement peut reprendre après une interruption.
          </small>
        </div>
      ) : (
        <button
          className="button"
          disabled={!status.available}
          onClick={async () => {
            try {
              setError("");
              setStatus(
                await api("admin/ai/setup", { method: "POST", body: "{}" }),
              );
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Télécharger et activer l’assistant
        </button>
      )}
      {!status.available && (
        <p className="modal-copy">
          Le moteur local démarre. Si ce message persiste, relancez Beam.
        </p>
      )}
      {(error || status.state === "error") && (
        <p role="alert" className="auth-error">
          {error || status.message}
        </p>
      )}
    </section>
  );
}
