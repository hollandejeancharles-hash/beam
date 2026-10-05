// Review links remain visible as proposals; they are never silently confirmed.
export function notebookFolders(topics) {
  return topics
    .map((topic) => {
      const links = topic.sources.filter((source) =>
        source.id.startsWith("note:"),
      );
      return {
        ...topic,
        noteIds: [...new Set(links.map((source) => source.id.slice(5)))],
        proposed: links.some((source) => source.confidence === "review"),
      };
    })
    .filter((topic) => topic.noteIds.length >= 2);
}
