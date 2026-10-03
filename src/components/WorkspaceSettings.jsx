import React, { useState } from "react";
import Workspace from "./Workspace";
import Collaboration from "./Collaboration";
import LocalAISetup from "./LocalAISetup";
import Maintenance from "./Maintenance";
import { SlidersHorizontal, Integration, Activity, RefreshCw } from "../icons";

const sections = [
  {
    id: "general",
    label: "Général",
    icon: SlidersHorizontal,
    title: "Identité du produit",
    description: "Le nom et l’image de votre produit dans Beam.",
  },
  {
    id: "team",
    label: "Équipe",
    icon: Integration,
    title: "Compte et collaboration",
    description: "Connectez-vous et choisissez la roadmap à partager.",
  },
  {
    id: "assistant",
    label: "Assistant",
    icon: Activity,
    title: "Assistant local",
    description: "Configurez l’IA qui organise vos notes sur ce Mac.",
  },
  {
    id: "installation",
    label: "Installation",
    icon: RefreshCw,
    title: "Votre installation",
    description: "Mises à jour, sauvegardes et guide de démarrage.",
  },
];
export default function WorkspaceSettings({
  product,
  profile,
  api,
  onSave,
  onClose,
  onChange,
  onRestore,
  onWelcome,
}) {
  const [active, setActive] = useState("general");
  const section = sections.find((s) => s.id === active);
  return (
    <div className="workspace-settings-shell">
      <nav
        className="workspace-settings-nav"
        aria-label="Sections des réglages"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={active === id ? "page" : undefined}
            className={active === id ? "active" : ""}
            onClick={() => setActive(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
      <div className="workspace-settings-content">
        <header className="workspace-settings-heading">
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </header>
        <div hidden={active !== "general"}>
          <Workspace
            product={product}
            api={api}
            onSave={onSave}
            onClose={onClose}
          />
        </div>
        <div hidden={active !== "team"}>
          <Collaboration api={api} profile={profile} onChange={onChange} />
        </div>
        <div hidden={active !== "assistant"}>
          <LocalAISetup api={api} showReady />
        </div>
        <div hidden={active !== "installation"}>
          <Maintenance api={api} onRestore={onRestore} onWelcome={onWelcome} />
        </div>
      </div>
    </div>
  );
}
