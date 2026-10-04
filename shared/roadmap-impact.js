import { DAY, dateValue, isoDate, isDate } from "./planning.js";
export const DATE_KINDS = {
  target: "Date cible",
  committed: "Engagement confirmé",
};
export const CHANGE_FIELDS = [
  "title",
  "description",
  "category",
  "priority",
  "status",
  "visibility",
  "quarter",
  "type",
  "parent_id",
  "start_date",
  "end_date",
  "progress",
  "owner",
  "dependency_id",
  "date_kind",
  "archived",
  "position",
  "kanban_position",
];
export function descendants(id, items) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of items)
      if (i.parent_id && ids.has(i.parent_id) && !ids.has(i.id)) {
        ids.add(i.id);
        changed = true;
      }
  }
  return items.filter((i) => ids.has(i.id) && i.id !== id);
}
export function planningImpact(
  items,
  publications,
  id,
  patch,
  cascade = false,
) {
  const item = items.find((i) => i.id === id && !i.archived);
  if (!item) throw Error("Cet élément n’est plus disponible.");
  const next = { ...item, ...patch };
  if (
    Boolean(next.start_date) !== Boolean(next.end_date) ||
    (next.start_date &&
      (!isDate(next.start_date) ||
        !isDate(next.end_date) ||
        next.end_date < next.start_date))
  )
    throw Error("Renseignez une période valide avant de replanifier.");
  const delta =
    item.start_date && next.start_date
      ? (dateValue(next.start_date) - dateValue(item.start_date)) / DAY
      : 0;
  const canShift =
    !!next.start_date &&
    !!next.end_date &&
    !!item.start_date &&
    !!item.end_date &&
    delta !== 0 &&
    dateValue(next.end_date) - dateValue(item.end_date) === delta * DAY;
  const children = descendants(id, items).filter((i) => !i.archived);
  const eligible = children.filter(
    (i) => i.status !== "done" && isDate(i.start_date) && isDate(i.end_date),
  );
  if (cascade && !canShift)
    throw Error(
      "Les enfants ne peuvent être décalés ensemble que pour un déplacement de la période entière.",
    );
  const changes = [{ id, patch }];
  if (cascade)
    for (const child of eligible) {
      const start_date = isoDate(dateValue(child.start_date) + delta * DAY),
        end_date = isoDate(dateValue(child.end_date) + delta * DAY);
      if (!isDate(start_date) || !isDate(end_date))
        throw Error("Une date enfant dépasse la période prise en charge.");
      changes.push({
        id: child.id,
        patch: {
          start_date,
          end_date,
          quarter: `T${Math.floor((Number(start_date.slice(5, 7)) - 1) / 3) + 1} ${start_date.slice(0, 4)}`,
        },
      });
    }
  const affected = new Set([id, ...children.map((i) => i.id)]),
    dependentIds = new Set(affected);
  let more = true;
  while (more) {
    more = false;
    for (const i of items)
      if (
        i.dependency_id &&
        dependentIds.has(i.dependency_id) &&
        !dependentIds.has(i.id)
      ) {
        dependentIds.add(i.id);
        more = true;
      }
  }
  const projected = items.map((i) => {
    const c = changes.find((c) => c.id === i.id);
    return c ? { ...i, ...c.patch } : i;
  });
  const dependencies = projected
    .filter(
      (i) =>
        !i.archived &&
        i.dependency_id &&
        (dependentIds.has(i.dependency_id) || affected.has(i.id)),
    )
    .map((i) => {
      const predecessor = projected.find((p) => p.id === i.dependency_id);
      return {
        id: i.id,
        title: i.title,
        conflict: !!(
          i.start_date &&
          predecessor?.end_date &&
          i.start_date <= predecessor.end_date
        ),
        dependency_title: predecessor?.title,
      };
    });
  const relatedPublications = publications
    .filter((p) =>
      [p.item_id, ...(p.item_ids || [])].some((id) => affected.has(id)),
    )
    .map((p) => ({
      id: p.id,
      title: p.title || p.version || "Publication",
      version: p.version,
      state: p.state,
    }));
  return {
    item: {
      id: item.id,
      title: item.title,
      start_date: item.start_date,
      end_date: item.end_date,
      date_kind: item.date_kind || "target",
    },
    next: { start_date: next.start_date, end_date: next.end_date },
    delta,
    canShift,
    cascade,
    changes,
    children: children.map((i) => ({
      id: i.id,
      title: i.title,
      start_date: i.start_date,
      end_date: i.end_date,
      status: i.status,
      shifted: changes.some((c) => c.id === i.id),
      outside_parent: (() => {
        const child = projected.find((c) => c.id === i.id),
          parent = projected.find((p) => p.id === child.parent_id);
        return !!(
          child.start_date &&
          child.end_date &&
          parent?.start_date &&
          parent?.end_date &&
          (child.start_date < parent.start_date ||
            child.end_date > parent.end_date)
        );
      })(),
    })),
    dependencies,
    publications: relatedPublications,
  };
}
