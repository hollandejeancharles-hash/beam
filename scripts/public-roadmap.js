// Explicit allowlist: private entries and per-visitor vote data never enter Pages.
export function publicRoadmap(items) {
  const publicIds = new Set(
    items.filter((item) => item.visibility === "public").map((item) => item.id),
  );
  return items
    .filter((item) => item.visibility === "public")
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      visibility: "public",
      quarter: item.quarter,
      type: item.type || "feature",
      parent_id: publicIds.has(item.parent_id) ? item.parent_id : null,
      dependency_id: publicIds.has(item.dependency_id)
        ? item.dependency_id
        : null,
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      progress: item.status === "done" ? 100 : item.progress || 0,
      owner: item.owner || "",
    }));
}
