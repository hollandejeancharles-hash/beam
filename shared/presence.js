export const activities = new Set([
  "gantt",
  "kanban",
  "notes",
  "feedback",
  "integrations",
  "publications",
  "settings",
  "idle",
  "browsing",
]);
export const safeActivity = (value) =>
  activities.has(value) ? value : "browsing";
export function activityPhrase(name, activity) {
  const phrases = {
    gantt: "joue au chef d’orchestre dans le gantt",
    kanban: "met les cartes sur la table dans le kanban",
    notes: "raconte sa vie dans ses notes",
    feedback: "fait le tri dans les demandes",
    integrations: "branche les fils dans les intégrations",
    publications: "prépare les nouvelles du produit",
    settings: "peaufine les réglages",
    idle: "a laissé Beam mijoter un instant",
    browsing: "se promène dans Beam",
  };
  return `${name || "Un membre"} ${phrases[safeActivity(activity)]}`;
}
export function recentActivity(entries, now = Date.now()) {
  return (
    entries
      .filter(
        (e) =>
          activities.has(e?.activity) &&
          Number.isFinite(e?.updatedAt) &&
          e.updatedAt <= now + 10000 &&
          now - e.updatedAt < 45000,
      )
      .sort(
        (a, b) =>
          (a.activity === "idle") - (b.activity === "idle") ||
          (b.interactedAt || b.updatedAt) - (a.interactedAt || a.updatedAt),
      )[0]?.activity || "idle"
  );
}
