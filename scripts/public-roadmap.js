// Explicit allowlist: private entries and per-visitor vote data never enter Pages.
export function publicRoadmap(items) {
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
    }));
}
