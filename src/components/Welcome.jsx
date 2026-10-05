import React, { useState, useEffect } from "react";
import Profile from "./Profile";
import Collaboration from "./Collaboration";
import LocalAISetup from "./LocalAISetup";
import AccountAccess from "./ui/neural-access-login";
export default function Welcome({
  api,
  profile,
  onProfile,
  onChange,
  onFinish,
}) {
  const [step, setStep] = useState(-1),
    [error, setError] = useState("");
  const [workspaceName,setWorkspaceName]=useState("Mon workspace"), [workspaceGeneration,setWorkspaceGeneration]=useState(0);
  useEffect(()=>{api("admin/product").then((p)=>setWorkspaceName(p.name)).catch(()=>{});},[]);
  const titles = ["Votre profil", "Votre équipe", "Votre assistant"];
  async function finish() {
    try {
      await api("admin/onboarding", { method: "POST", body: "{}" });
      onFinish();
    } catch (e) {
      setError(e.message);
    }
  }
  if (step === -1)
    return (
      <AccountAccess
        api={api}
        profile={profile}
        onProfile={onProfile}
        onContinue={() => {
          onChange?.();
          setStep(1);
        }}
        onLocal={() => setStep(0)}
      />
    );
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
        <section className="welcome-team-step">
          <label className="welcome-workspace-name">Nom de votre workspace
            <input value={workspaceName} maxLength={80} onChange={(e)=>setWorkspaceName(e.target.value)} onBlur={async()=>{
              try {await api("admin/product",{method:"PATCH",body:JSON.stringify({name:workspaceName})});setWorkspaceGeneration((n)=>n+1);onChange?.();}catch(e){setError(e.message);}
            }} />
          </label>
          <Collaboration key={workspaceGeneration} api={api} profile={profile} onChange={onChange} />
          <button className="button primary" onClick={() => setStep(2)}>
            Continuer
          </button>
          <p className="modal-copy">
            Vous pouvez aussi commencer seul et rejoindre une équipe plus tard.
          </p>
        </section>
      )}
      {step === 2 && (
        <section className="welcome-assistant-step">
          <LocalAISetup api={api} showReady />
          <p className="modal-copy">
            Le téléchargement peut continuer pendant que vous utilisez Beam.
            Aucune note n’est envoyée à un service IA externe.
          </p>
          <button className="button primary" onClick={finish}>
            Ouvrir ma roadmap
          </button>
        </section>
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
