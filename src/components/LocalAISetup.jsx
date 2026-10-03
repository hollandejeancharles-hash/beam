import React, { useEffect, useState } from "react";
export default function LocalAISetup({ api }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const update = () =>
      api("admin/ai/setup")
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {});
    update();
    const timer = setInterval(update, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!status || status.installed) return null;
  const busy = status.state === "downloading",
    percent = status.total
      ? Math.floor((status.completed / status.total) * 100)
      : null;
  return (
    <section className="collaboration-settings">
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
        <>
          <p role="status">
            {status.message}
            {percent !== null ? " · " + percent + " %" : ""}
          </p>
          {percent !== null && (
            <progress value={status.completed} max={status.total} />
          )}
          <small>
            Le téléchargement peut reprendre après une interruption.
          </small>
        </>
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
          Télécharger le modèle IA
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
