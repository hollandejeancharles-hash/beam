import useVisiblePolling, { unchangedData } from "../hooks/useVisiblePolling";
import React, { useEffect, useState } from "react";
import { activityPhrase } from "../../shared/presence";
import { initials } from "./Profile";
const labels = {
  title: "Titre",
  description: "Description",
  status: "État",
  priority: "Priorité",
  start_date: "Début",
  end_date: "Fin",
  owner: "Responsable",
  parent_id: "Rattachement",
  dependency_id: "Dépendance",
  position: "Ordre du Gantt",
  kanban_position: "Ordre du Kanban",
  archived: "Archive",
  progress: "Avancement",
  visibility: "Visibilité",
  type: "Type",
  category: "Catégorie",
  quarter: "Horizon",
  date_kind: "Engagement",
  outcome: "Résultat attendu",
  success_measure: "Mesure",
  success_target: "Cible",
  outcome_result: "Bilan",
  outcome_verdict: "Constat",
  outcome_reviewed_at: "Date du bilan",
  brief_id: "Brief source",
};
const values = {
  unmeasured: "Non mesuré",
  positive: "Atteint",
  mixed: "Partiellement atteint",
  negative: "Non atteint",
  target: "Date cible",
  committed: "Engagement confirmé",
  planned: "Planifié",
  progress: "En cours",
  done: "Terminé",
  high: "Haute",
  medium: "Normale",
  low: "Basse",
  private: "Interne",
  public: "Publique",
};
export function usePresenceActivity(api, state, activity) {
  useEffect(() => {
    if (!state?.workspace || !state?.signedIn) return;
    const clientId = crypto.randomUUID();
    let lastInteraction = Date.now(),
      lastReported = 0;
    const publish = () => {
      lastReported = Date.now();
      return api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({
          action: "presence",
          clientId,
          interactedAt: lastInteraction,
          activity:
            document.hidden || Date.now() - lastInteraction > 120000
              ? "idle"
              : activity,
        }),
      }).catch(() => {});
    };
    const interact = () => {
      const wasIdle = Date.now() - lastInteraction > 120000;
      lastInteraction = Date.now();
      if (wasIdle || lastInteraction - lastReported > 5000) void publish();
    };
    void publish();
    const timer = setInterval(publish, 15000);
    document.addEventListener("visibilitychange", publish);
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", publish);
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
      void api("admin/collaboration", {
        method: "POST",
        body: JSON.stringify({
          action: "presence",
          clientId,
          activity: "idle",
        }),
      }).catch(() => {});
    };
  }, [state?.workspace?.id, state?.signedIn, activity]);
}
export function TeamPresence({ api, state, onOpen, activity = "browsing" }) {
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    let alive = true;
    if (state?.workspace)
      api("admin/team")
        .then((r) => {
          if (alive) setProfiles(r.profiles);
        })
        .catch(() => {});
    else setProfiles([]);
    return () => {
      alive = false;
    };
  }, [state?.workspace?.id, state?.presence?.join(","), state?.changeVersion]);
  useVisiblePolling(
    async () => {
      if (!state?.workspace) return;
      try {
        setProfiles((await api("admin/team")).profiles);
      } catch {}
    },
    15000,
    [state?.workspace?.id],
  );
  usePresenceActivity(api, state, activity);
  if (!state?.workspace) return null;
  const online = profiles.filter((p) => state.presence?.includes(p.user_id));
  return (
    <button
      className="team-presence"
      onClick={onOpen}
      aria-label={`${online.length} personne(s) connectée(s). Ouvrir l’espace partagé`}
    >
      {online.slice(0, 4).map((p) => (
        <span
          className="presence-person"
          key={p.user_id}
          tabIndex={0}
          aria-label={activityPhrase(
            p.name,
            state.presenceActivity?.[p.user_id],
          )}
        >
          <span className="avatar">
            {p.photo ? <img src={p.photo} alt="" /> : initials(p.name)}
          </span>
          <span className="presence-tooltip" role="tooltip">
            {activityPhrase(p.name, state.presenceActivity?.[p.user_id])}
          </span>
        </span>
      ))}
      <span>
        {state.presenceStatus === "reconnecting"
          ? "Reconnexion…"
          : online.length
            ? `${online.length} en ligne`
            : "Équipe"}
      </span>
    </button>
  );
}
export default function TeamActivity({ api, itemId, state }) {
  const [data, setData] = useState({
      profiles: [],
      comments: [],
      activity: [],
    }),
    [tab, setTab] = useState("comments"),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const next = await api("admin/team?item=" + encodeURIComponent(itemId));
      setData((previous) => unchangedData(previous, next));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useVisiblePolling(load, 10000, [
    itemId,
    state?.workspace?.revision,
    state?.changeVersion,
  ]);
  if (!state?.workspace) return null;
  const person = (id) => data.profiles.find((p) => p.user_id === id);
  return (
    <section className="team-activity">
      <div className="team-tabs">
        <button
          className={tab === "comments" ? "active" : ""}
          onClick={() => setTab("comments")}
        >
          Commentaires <small>{data.comments.length}</small>
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          Historique partagé
        </button>
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {tab === "comments" ? (
        <>
          {state.workspace.role !== "viewer" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api("admin/collaboration", {
                    method: "POST",
                    body: JSON.stringify({ action: "comment", itemId, body }),
                  });
                  setBody("");
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <textarea
                aria-label="Commentaire pour l’équipe"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Une question, une précision pour l’équipe…"
                maxLength={4000}
                rows={3}
              />
              <button className="button" disabled={busy || !body.trim()}>
                Publier le commentaire
              </button>
              <small>Visible par les membres de cet espace.</small>
            </form>
          )}
          {!data.comments.length && (
            <p className="modal-copy">
              La conversation autour de cet élément commence ici.
            </p>
          )}
          {data.comments.map((c) => (
            <article className="team-entry" key={c.id}>
              <span className="avatar">
                {person(c.user_id)?.photo ? (
                  <img src={person(c.user_id).photo} alt="" />
                ) : (
                  initials(person(c.user_id)?.name)
                )}
              </span>
              <div>
                <strong>
                  {person(c.user_id)?.name || "Membre de l’équipe"}
                </strong>
                <time>{new Date(c.created_at).toLocaleString("fr-FR")}</time>
                <p>{c.body}</p>
              </div>
            </article>
          ))}
        </>
      ) : (
        <>
          {!data.activity.length && (
            <p className="modal-copy">
              Les prochaines modifications apparaîtront ici.
            </p>
          )}
          {data.activity.map((a) => (
            <article className="team-entry" key={a.id}>
              <div>
                <strong>
                  {person(a.user_id)?.name || "Membre de l’équipe"}
                </strong>
                <time>{new Date(a.created_at).toLocaleString("fr-FR")}</time>
                <p>
                  {a.action === "created"
                    ? "A créé cet élément"
                    : a.action === "deleted"
                      ? "A supprimé cet élément"
                      : "A modifié cet élément"}
                </p>
                {a.action === "updated" && (
                  <ul>
                    {Object.entries(a.changes).map(([key, c]) => (
                      <li key={key}>
                        <b>{labels[key] || key}</b>
                        {[
                          "description",
                          "parent_id",
                          "dependency_id",
                          "position",
                          "kanban_position",
                        ].includes(key)
                          ? " mis à jour"
                          : ` : ${values[c.before] ?? c.before ?? "Non défini"} → ${values[c.after] ?? c.after ?? "Non défini"}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
