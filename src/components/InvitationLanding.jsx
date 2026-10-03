import React from "react";
import { Link2, ArrowRight } from "../icons";
import { invitationCode } from "../../shared/invitations";
export default function InvitationLanding() {
  const code = invitationCode(location.href);
  return (
    <main className="invitation-landing">
      <div className="invitation-landing-card">
        <span className="invitation-brand">beam.</span>
        <span className="workspace-access-icon">
          <Link2 size={26} />
        </span>
        <h1>
          {code
            ? "Votre équipe vous attend."
            : "Ce lien d’invitation est incomplet."}
        </h1>
        <p>
          {code
            ? "Ouvrez Beam pour rejoindre le workspace. Vos autres espaces et vos notes restent à vous."
            : "Demandez à votre collègue de vous renvoyer le lien complet."}
        </p>
        {code && (
          <>
            <a
              className="button primary workspace-access-submit"
              href={`beam://join?code=${code}`}
            >
              Ouvrir dans Beam <ArrowRight size={16} />
            </a>
            <details>
              <summary>Beam est déjà ouvert dans mon navigateur</summary>
              <a
                className="button"
                href={`http://127.0.0.1:5173/#invite=${code}`}
              >
                Rejoindre dans Beam local
              </a>
            </details>
            <p className="workspace-access-footnote">
              Vous pouvez aussi coller ce lien dans Beam → Rejoindre un
              workspace.
            </p>
          </>
        )}
        <a
          className="text-button"
          href="https://github.com/hollandejeancharles-hash/beam/releases"
        >
          Télécharger Beam pour Mac
        </a>
      </div>
    </main>
  );
}
