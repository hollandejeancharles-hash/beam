import React, { useEffect, useState } from "react";
import { Integration, RefreshCw } from "../icons";
export default function ConversationIntake({ api }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setState(await api("admin/intake"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    api("admin/intake")
      .then((s) => {
        if (alive) setState(s);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section
      className="conversation-intake"
      aria-label="Conversations vers Demandes"
    >
      <header>
        <Integration size={18} />
        <div>
          <strong>Des conversations aux demandes</strong>
          <p>
            Mentionnez Beam dans Slack ou Teams. Les demandes arrivent ici, puis
            votre assistant local les analyse.
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Actualiser les connexions"
          disabled={busy}
          onClick={load}
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {error && (
        <p role="alert">Impossible de vérifier les connexions : {error}</p>
      )}
      <div className="conversation-intake-providers">
        {["slack", "teams"].map((provider) => {
          const c = state?.connections.find((c) => c.provider === provider);
          return (
            <div key={provider}>
              <strong>
                {provider === "slack" ? "Slack" : "Microsoft Teams"}
              </strong>
              <span>
                {!state
                  ? "Vérification…"
                  : !c
                    ? "Non configuré"
                    : !c.enabled
                      ? "Désactivé"
                      : c.last_received_at
                        ? "Réception vérifiée"
                        : "Configuré · en attente du premier message"}
              </span>
              {c && (
                <small>
                  {c.channels.length}{" "}
                  {c.channels.length > 1 ? "canaux" : "canal"} autorisé
                  {c.channels.length > 1 ? "s" : ""}
                  {c.last_received_at &&
                    ` · Dernière réception ${new Date(c.last_received_at).toLocaleString("fr-FR")}`}
                </small>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="text-button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Comment activer les connexions
      </button>
      {expanded && (
        <div className="conversation-intake-help">
          <p>
            {state?.shared
              ? "Un administrateur configure les applications Slack et Teams et les points d’entrée Supabase."
              : "Partagez d’abord ce workspace avec votre équipe, puis configurez les applications Slack et Teams."}{" "}
            Les jetons restent sur Supabase, jamais dans les notes ou le package
            Mac.
          </p>
          <ol>
            <li>
              Déployer les deux fonctions et la migration 004 du dépôt Beam.
            </li>
            <li>
              Installer l’application Beam dans Slack ou Teams et autoriser les
              canaux destinés à ce workspace.
            </li>
            <li>
              Mentionner @Beam avec une demande, puis vérifier sa réception dans
              Demandes.
            </li>
          </ol>
          <a
            href="https://github.com/hollandejeancharles-hash/beam/blob/main/docs/conversation-intake.md"
            target="_blank"
            rel="noreferrer"
          >
            Guide de configuration
          </a>
          <p>
            Seul le message adressé à Beam est partagé. Aucun historique complet
            n’est aspiré. L’analyse IA démarre sur un Mac avec Beam ouvert et
            l’assistant activé.
          </p>
        </div>
      )}
    </section>
  );
}
