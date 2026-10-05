// Each local section can render when ready; a slow model must not hold notes.
export async function loadNotebook(api, receive, onError) {
  const sections = {
    notes: "admin/notes",
    status: "admin/ai/status",
    reviews: "admin/ai/reviews",
    subjects: "admin/topics",
    inbox: "admin/inbox",
  };
  await Promise.allSettled(
    Object.entries(sections).map(async ([section, path]) => {
      try {
        receive(section, await api(path));
      } catch (error) {
        onError(error, section);
      }
    }),
  );
}
