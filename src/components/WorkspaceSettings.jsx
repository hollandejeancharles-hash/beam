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
    title: "Collaboration du workspace",
    description: "Une roadmap commune pour avancer en équipe.",
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
  onAccount,
  initialSection = "general",
}) {
  const [active, setActive] = useState(initialSection);
  const section = sections.find((s) => s.id === active);
  return (
    <div className="workspace-settings-shell">
      <div className="workspace-settings-identity">
        <span className="workspace-identity-image">
          {product.image ? (
            <img src={product.image} alt="" />
          ) : (
            product.name.slice(0, 1)
          )}
        </span>
        <div>
          <strong>{product.name}</strong>
          <span>Réglages du produit</span>
        </div>
      </div>
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
          <Collaboration
            api={api}
            profile={profile}
            product={product}
            onChange={onChange}
            onAccount={onAccount}
          />
        </div>
        <div hidden={active !== "assistant"}>
          <LocalAISetup api={api} showReady />
        </div>
        <div hidden={active !== "installation"}>
          <Maintenance
            product={product}
            api={api}
            onRestore={onRestore}
            onWelcome={onWelcome}
          />
        </div>
      </div>
    </div>
  );
}
