export const TYPES = {
  initiative: "Initiative",
  project: "Projet",
  feature: "Feature",
};
export const DAY = 86400000;
export function dateValue(value) {
  return Date.parse(value + "T00:00:00Z");
}
export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}
export function isDate(value) {
  return (
    typeof value === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(dateValue(value)) &&
    isoDate(dateValue(value)) === value
  );
}
export function quarterRange(quarter) {
  const match = /^T([1-4]) (20\d{2})$/.exec(quarter || "");
  if (!match) return null;
  const month = (Number(match[1]) - 1) * 3;
  return {
    start: Date.UTC(Number(match[2]), month, 1),
    end: Date.UTC(Number(match[2]), month + 3, 0),
    estimated: true,
  };
}
export function planningRange(item, items, seen = new Set()) {
  if (seen.has(item.id)) return null;
  const next = new Set(seen).add(item.id);
  if (item.start_date && item.end_date)
    return {
      start: dateValue(item.start_date),
      end: dateValue(item.end_date),
      estimated: false,
    };
  const children = items.filter((child) => child.parent_id === item.id);
  const ranges = children
    .map((child) => planningRange(child, items, next))
    .filter(Boolean);
  if (ranges.length)
    return {
      start: Math.min(...ranges.map((r) => r.start)),
      end: Math.max(...ranges.map((r) => r.end)),
      estimated: ranges.some((r) => r.estimated),
      derived: true,
    };
  return quarterRange(item.quarter);
}
export function progressValue(item, items, seen = new Set()) {
  if (seen.has(item.id)) return 0;
  const next = new Set(seen).add(item.id);
  const children = items.filter((child) => child.parent_id === item.id);
  if (children.length)
    return Math.round(
      children.reduce((sum, c) => sum + progressValue(c, items, next), 0) /
        children.length,
    );
  return item.status === "done" ? 100 : Number(item.progress || 0);
}
export function hierarchyRows(items, collapsed = new Set()) {
  const result = [],
    seen = new Set(),
    ids = new Set(items.map((i) => i.id));
  function visit(item, depth) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    const children = items.filter((i) => i.parent_id === item.id);
    result.push({ item, depth, hasChildren: children.length > 0 });
    if (!collapsed.has(item.id))
      children.forEach((child) => visit(child, depth + 1));
  }
  items
    .filter((i) => !i.parent_id || !ids.has(i.parent_id))
    .forEach((item) => visit(item, 0));
  return result;
}
export function validatePlanning(value, id, items) {
  if (!Object.hasOwn(TYPES, value.type)) throw Error("Type de suivi invalide");
  if (typeof value.owner !== "string" || value.owner.length > 80)
    throw Error("Responsable invalide");
  if (
    !Number.isInteger(value.progress) ||
    value.progress < 0 ||
    value.progress > 100
  )
    throw Error("Avancement invalide");
  if (Boolean(value.start_date) !== Boolean(value.end_date))
    throw Error("Renseignez les deux dates ou laissez-les vides");
  if (
    value.start_date &&
    (!isDate(value.start_date) ||
      !isDate(value.end_date) ||
      value.end_date < value.start_date)
  )
    throw Error("La date de fin doit suivre la date de début");
  const records = new Map(items.map((i) => [i.id, i]));
  records.set(id, { ...value, id });
  for (const record of records.values()) {
    if (record.parent_id) {
      const parent = records.get(record.parent_id);
      if (
        !parent ||
        parent.id === record.id ||
        !(
          (record.type === "project" && parent.type === "initiative") ||
          (record.type === "feature" &&
            ["project", "initiative"].includes(parent.type))
        )
      )
        throw Error(
          "Une feature se rattache à un projet ou une initiative ; un projet se rattache à une initiative",
        );
    }
  }
  if (value.dependency_id) {
    if (!records.has(value.dependency_id) || value.dependency_id === id)
      throw Error("Dépendance invalide");
    const seen = new Set([id]);
    let current = records.get(value.dependency_id);
    while (current) {
      if (seen.has(current.id))
        throw Error("Les dépendances ne peuvent pas former une boucle");
      seen.add(current.id);
      current = records.get(current.dependency_id);
    }
  }
}
