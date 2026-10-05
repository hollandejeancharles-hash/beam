import test from "node:test";
import assert from "node:assert/strict";
import { notebookFolders } from "../shared/notebook-folders.js";
test("uncertain note groups remain visible as proposals without including integration-only topics", () => {
  const sources = [
    { id: "note:a", confidence: "review" },
    { id: "note:b", confidence: "clear" },
  ];
  const result = notebookFolders([
    { id: "notes", sources },
    {
      id: "signals",
      sources: [
        { id: "signal:a", confidence: "clear" },
        { id: "signal:b", confidence: "clear" },
      ],
    },
    { id: "single", sources: [sources[0]] },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].noteIds, ["a", "b"]);
  assert.equal(result[0].proposed, true);
  assert.equal(sources[0].confidence, "review");
  const confirmed = notebookFolders([
    {
      id: "notes",
      sources: sources.map((source) => ({ ...source, confidence: "clear" })),
    },
  ]);
  assert.equal(confirmed[0].proposed, false);
});
