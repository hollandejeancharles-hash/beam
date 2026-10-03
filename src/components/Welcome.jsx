import React, { useState } from "react";
import Profile from "./Profile";
import Collaboration from "./Collaboration";
import LocalAISetup from "./LocalAISetup";
export default function Welcome({
  api,
  profile,
  onProfile,
  onChange,
  onFinish,
}) {
  const [step, setStep] = useState(0),
    [error, setError] = useState("");
  const titles = ["Votre profil", "Votre équipe", "Votre assistant"];
  async function finish() {
    try {
      await api("admin/onboarding", { method: "POST", body: "{}" });
      onFinish();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="welcome-flow">
      <p className="eyebrow">BIENVENUE DANS BEAM</p>
      <h2>Votre roadmap, votre équipe.</h2>
      <p className="modal-copy">
        Quelques étapes pour commencer. Vous pourrez modifier ces réglages à
        tout moment.
      </p>
      <nav className="welcome-steps" aria-label="Configuration initiale">
        {titles.map((t, i) => (
          <button
            key={t}
            className={i === step ? "active" : ""}
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i + 1}</span>
            {t}
          </button>
        ))}
      </nav>
      {step === 0 && (
        <Profile
          saveLabel="Enregistrer et continuer"
          cancelLabel="Passer"
          profile={profile}
          api={api}
          onSave={onProfile}
          onClose={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <>
          <Collaboration api={api} profile={profile} onChange={onChange} />
          <button className="button primary" onClick={() => setStep(2)}>
            Continuer
          </button>
          <p className="modal-copy">
            Vous pouvez aussi commencer seul et rejoindre une équipe plus tard.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <LocalAISetup api={api} showReady />
          <p className="modal-copy">
            Le téléchargement peut continuer pendant que vous utilisez Beam.
            Aucune note n’est envoyée à un service IA externe.
          </p>
          <button className="button primary" onClick={finish}>
            Ouvrir ma roadmap
          </button>
        </>
      )}
      <div className="welcome-footer">
        <button className="text-button" onClick={finish}>
          Configurer plus tard
        </button>
        {step > 0 && (
          <button className="text-button" onClick={() => setStep(step - 1)}>
            Retour
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
}
