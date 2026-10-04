import { createHash } from "node:crypto";
const significant = [
  "status",
  "priority",
  "start_date",
  "end_date",
  "owner",
  "date_kind",
];
export function notificationRows({
  inbox = [],
  team = {},
  items = [],
  userId,
  since,
  connection = {},
  now = new Date().toISOString(),
}) {
  const result = [],
    itemById = new Map(items.map((i) => [i.id, i]));
  const person = (id) =>
    team.profiles?.find((p) => p.user_id === id)?.name || "Un membre";
  const target = (id) =>
    itemById.has(id) ? { kind: "item", id } : { kind: "gantt" };
  const me = team.profiles?.find((p) => p.user_id === userId)?.name?.trim();
  const mention = (body) =>
    me &&
    typeof body === "string" &&
    body.toLocaleLowerCase("fr").includes("@" + me.toLocaleLowerCase("fr")) &&
    new RegExp(
      "@" + me.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[\\s,.;:!?])",
      "iu",
    ).test(body);
  for (const c of team.comments || []) {
    if (
      c.user_id === userId ||
      c.created_at < since ||
      !itemById.has(c.item_id)
    )
      continue;
    result.push({
      id: "comment:" + c.id,
      kind: "comment",
      title:
        person(c.user_id) +
        (mention(c.body) ? " vous a mentionné" : " a commenté"),
      description: itemById.get(c.item_id).title,
      created: c.created_at,
      target: target(c.item_id),
    });
  }
  const grouped = new Map();
  for (const a of team.activity || []) {
    if (
      a.user_id === userId ||
      a.created_at < since ||
      (a.action !== "deleted" && !significant.some((k) => a.changes?.[k]))
    )
      continue;
    const previous = grouped.get(a.item_id);
    if (!previous || a.created_at > previous.created_at)
      grouped.set(a.item_id, a);
  }
  for (const a of grouped.values())
    result.push({
      id: "change:" + a.id,
      kind: "change",
      title:
        person(a.user_id) +
        (a.action === "deleted"
          ? " a supprimé un élément"
          : " a mis à jour la roadmap"),
      description:
        itemById.get(a.item_id)?.title || "Consulter la planification",
      created: a.created_at,
      target: target(a.item_id),
    });
  if (inbox.length) {
    const digest = createHash("sha256")
      .update(
        inbox
          .map((i) => i.id)
          .sort()
          .join("|"),
      )
      .digest("hex")
      .slice(0, 20);
    result.push({
      id: "ai:" + digest,
      entries: inbox.map((i) => "ai-entry:" + i.id),
      kind: "ai",
      title: `${inbox.length} proposition${inbox.length > 1 ? "s" : ""} à examiner`,
      description: "L’assistant local attend votre validation.",
      created:
        inbox
          .map((i) => i.created)
          .filter(Boolean)
          .sort()
          .at(-1) || now,
      target: { kind: "review" },
    });
  }
  if (
    connection.workspace &&
    connection.signedIn &&
    !connection.connected &&
    connection.error
  )
    result.push({
      id: "connection:" + connection.workspace.id,
      kind: "connection",
      title: "Synchronisation interrompue",
      description: "Vérifiez la connexion à votre workspace.",
      created: now,
      target: { kind: "workspace" },
    });
  return result
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, 100);
}
export function createNotifications(store) {
  function load(userId) {
    const key = "notifications:" + (userId || "local");
    const raw = store.db
      .prepare("SELECT value FROM metadata WHERE key=?")
      .get(key);
    const data = raw
      ? JSON.parse(raw.value)
      : { since: new Date().toISOString(), read: [] };
    if (!raw) save(key, data);
    return { key, data };
  }
  function save(key, data) {
    store.db
      .prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)")
      .run(key, JSON.stringify(data));
  }
  return {
    since(userId) {
      return load(userId).data.since;
    },
    list(userId, rows) {
      const { key, data } = load(userId);
      data.groups = Object.fromEntries(
        [
          ...Object.entries(data.groups || {}),
          ...rows.filter((r) => r.entries).map((r) => [r.id, r.entries]),
        ].slice(-20),
      );
      save(key, data);
      return {
        notifications: rows.map(({ entries, ...r }) => ({
          ...r,
          read: entries
            ? entries.every((id) => data.read.includes(id))
            : data.read.includes(r.id),
        })),
      };
    },
    read(userId, ids) {
      if (
        !Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== "string" || id.length > 150)
      )
        throw Error("Notifications invalides.");
      const { key, data } = load(userId);
      data.read = [
        ...new Set([
          ...data.read,
          ...ids.flatMap((id) => data.groups?.[id] || [id]),
        ]),
      ].slice(-5000);
      save(key, data);
      return { ok: true };
    },
  };
}
