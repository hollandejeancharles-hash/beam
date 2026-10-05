export function documentReferences(node) {
  const refs = [];
  function visit(n) {
    if (n?.type === "mention")
      refs.push({
        workspace_id: n.attrs.workspace_id,
        ...(n.attrs.item_id ? { item_id: n.attrs.item_id } : {}),
      });
    for (const child of n?.content || []) visit(child);
  }
  visit(node);
  return [
    ...new Map(
      refs.map((r) => [r.workspace_id + ":" + (r.item_id || ""), r]),
    ).values(),
  ];
}
export function conversionContext(note, catalog, active, type) {
  const explicit = documentReferences(note.document);
  const refs = explicit.some((r) => r.item_id)
    ? explicit
    : note.references || [];
  const itemWorkspaces = [
    ...new Set(refs.filter((r) => r.item_id).map((r) => r.workspace_id)),
  ];
  const workspaceIds = itemWorkspaces.length
    ? itemWorkspaces
    : note.workspace_ids || [];
  const available = workspaceIds.filter((id) =>
    catalog.some((w) => w.id === id),
  );
  const workspaceId =
    available.length === 1
      ? available[0]
      : available.includes(active)
        ? active
        : available[0] || active;
  const parents = (
    catalog.find((w) => w.id === workspaceId)?.items || []
  ).filter(
    (i) =>
      refs.some((r) => r.workspace_id === workspaceId && r.item_id === i.id) &&
      (type === "demand"
        ? true
        : type === "task"
          ? ["initiative", "project", "feature"].includes(i.type)
          : ["initiative", "project"].includes(i.type)),
  );
  return {
    workspaceId,
    parentId: parents.length === 1 ? parents[0].id : "",
    ambiguous: available.length > 1,
  };
}
