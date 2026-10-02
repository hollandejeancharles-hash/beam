import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createDecisions, validateDecisions } from "./decisions.js";
import { buildInbox } from "../shared/inbox.js";
import { buildSearchRecords } from "../shared/search.js";
const feature = {
  title: "Zoom",
  description: "Zoom de l’éditeur",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "private",
  quarter: "T4 2026",
};
function setup() {
  const store = createStore(":memory:"),
    notes = createNotes(store),
    itemId = store.save(feature),
    item = store.list().find((i) => i.id === itemId),
    note = notes.save({
      text: "Validé avec Marie : reporter le zoom après la refonte.",
    }),
    decisions = createDecisions(store);
  const d = {
    title: "Reporter le zoom",
    kind: "defer",
    reason: "Après la refonte de l’éditeur",
    note_id: note.id,
    quote: note.text,
    item_ids: [item.id],
  };
  return {
    store,
    notes,
    item,
    note,
    decisions,
    d,
    context: { notes: [note], items: [item] },
  };
}
test("AI decision requires a real source quote and known elements", () => {
  const x = setup();
  assert.equal(validateDecisions([x.d], x.context).length, 1);
  assert.throws(() =>
    validateDecisions([{ ...x.d, quote: "Priorité urgente" }], x.context),
  );
  assert.throws(() =>
    validateDecisions([{ ...x.d, item_ids: ["invented"] }], x.context),
  );
  assert.throws(() =>
    validateDecisions([{ ...x.d, note_id: "invented" }], x.context),
  );
  x.store.db.close();
});
test("proposals need approval, are deduplicated and rejected decisions stay rejected", () => {
  const x = setup();
  x.decisions.propose([x.d], x.context);
  x.decisions.propose([x.d], x.context);
  assert.equal(x.decisions.list().length, 1);
  assert.deepEqual(x.decisions.context([x.item], [x.note]), []);
  const d = x.decisions.list()[0];
  assert.equal(
    buildInbox({ ...x.context, decisions: [d] })[0].kind,
    "decision",
  );
  x.decisions.decide(d.id, "dismissed");
  x.decisions.propose([x.d], x.context);
  assert.equal(x.decisions.list()[0].state, "dismissed");
  assert.deepEqual(
    buildInbox({ ...x.context, decisions: x.decisions.list() }),
    [],
  );
  x.store.db.close();
});
test("confirmed decisions become AI context without changing roadmap and can be archived", () => {
  const x = setup();
  x.decisions.propose([x.d], x.context);
  x.decisions.decide(x.decisions.list()[0].id, "confirmed");
  assert.equal(x.decisions.context([x.item], []).length, 1);
  assert.equal(x.decisions.context([], []).length, 0);
  assert.equal(x.store.list()[0].priority, "medium");
  assert.equal(x.decisions.context([x.item], [])[0].quote, x.note.text);
  x.decisions.decide(x.decisions.list()[0].id, "archived");
  assert.deepEqual(x.decisions.context([x.item], [x.note]), []);
  x.store.db.close();
});
test("changed sources cannot be confirmed; decision memory remains private in search", () => {
  const x = setup();
  x.decisions.propose([x.d], x.context);
  x.notes.save({ text: "Nouveau texte" }, x.note.id);
  assert.throws(() =>
    x.decisions.decide(x.decisions.list()[0].id, "confirmed"),
  );
  assert.deepEqual(
    buildInbox({
      notes: x.notes.list(),
      items: [x.item],
      decisions: x.decisions.list(),
    }),
    [],
  );
  assert.deepEqual(
    buildSearchRecords({ decisions: x.decisions.list() }, true),
    [],
  );
  x.store.db.close();
});
