import test from "node:test";
import assert from "node:assert/strict";
import { buildInbox } from "../shared/inbox.js";
const note = {
  id: "n",
  text: "Besoin de recherche",
  state: "open",
  attachments: [],
};
const item = { id: "i", title: "Éditeur" };
const proposal = {
  action: "update",
  item_id: "i",
  title: "Améliorer la recherche",
  reason: "Demandé par un client",
  note_ids: ["n"],
  signal_ids: [],
};
const review = {
  id: "r",
  scope: "note",
  entity_id: "n",
  state: "ready",
  context: { notes: [note], signals: [] },
  result: { proposals: [proposal] },
};
test("inbox includes actionable proposals with source evidence and ignores handled or archived entries", () => {
  const base = { reviews: [review], notes: [note], items: [item] };
  assert.equal(buildInbox(base)[0].sources[0].title, note.text);
  for (const flag of ["applied", "dismissed"])
    assert.deepEqual(
      buildInbox({
        ...base,
        reviews: [
          { ...review, result: { proposals: [{ ...proposal, [flag]: true }] } },
        ],
      }),
      [],
    );
  assert.deepEqual(
    buildInbox({ ...base, notes: [{ ...note, state: "archived" }] }),
    [],
  );
  assert.deepEqual(
    buildInbox({ ...base, items: [{ ...item, archived: 1 }] }),
    [],
  );
  assert.deepEqual(
    buildInbox({ ...base, notes: [{ ...note, text: "Texte modifié" }] }),
    [],
  );
});
test("only the latest analysis for an entity can produce inbox entries", () => {
  assert.deepEqual(
    buildInbox({
      reviews: [{ ...review, id: "new", state: "running" }, review],
      notes: [note],
      items: [item],
    }),
    [],
  );
});
test("uncertain topic and roadmap links appear once, confirmed links stay out", () => {
  const rows = buildInbox({
    matches: [
      {
        source: "note:n",
        item_id: "i",
        item_title: "Éditeur",
        title: note.text,
        confidence: "review",
      },
      { source: "signal:s", item_id: "i", confidence: "clear" },
    ],
    topics: [
      {
        id: "t",
        title: "Recherche",
        sources: [
          { id: "note:n", title: note.text, confidence: "review" },
          { id: "signal:s", confidence: "clear" },
        ],
      },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["association", "topic"],
  );
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
});
