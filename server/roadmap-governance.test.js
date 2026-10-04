import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createDecisions } from "./decisions.js";
import { createGovernance } from "./roadmap-governance.js";
import { planningImpact } from "../shared/roadmap-impact.js";
import { publicRoadmap } from "../scripts/public-roadmap.js";
const basic = {
  title: "Éditeur",
  description: "Édition",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "public",
  quarter: "T4 2026",
};
function setup() {
  const store = createStore(":memory:"),
    notes = createNotes(store),
    decisions = createDecisions(store),
    pubs = [],
    signals = [];
  const gov = createGovernance(store, {
    notes,
    decisions,
    publications: { list: () => pubs },
    integrations: { signals: () => signals },
  });
  return { store, notes, decisions, pubs, signals, gov };
}
test("Planning confidence is conservative, validated and exported publicly", () => {
  const x = setup();
  try {
    const id = x.store.save(basic);
    assert.equal(x.store.list()[0].date_kind, "target");
    x.store.save({ date_kind: "committed" }, id);
    assert.equal(publicRoadmap(x.store.list())[0].date_kind, "committed");
    assert.throws(() => x.store.save({ date_kind: "certain" }, id));
    assert.equal(x.store.list()[0].date_kind, "committed");
  } finally {
    x.store.db.close();
  }
});
test("Impact includes descendants, dependency conflicts and actual publications, and never shifts completed children", () => {
  const x = setup();
  try {
    const root = x.store.save({
        ...basic,
        type: "initiative",
        start_date: "2026-10-01",
        end_date: "2026-10-30",
      }),
      child = x.store.save({
        ...basic,
        title: "Zoom",
        parent_id: root,
        start_date: "2026-10-02",
        end_date: "2026-10-10",
      }),
      done = x.store.save({
        ...basic,
        title: "Livré",
        parent_id: root,
        status: "done",
        start_date: "2026-10-02",
        end_date: "2026-10-05",
      }),
      dep = x.store.save({
        ...basic,
        title: "API",
        dependency_id: child,
        start_date: "2026-10-12",
        end_date: "2026-10-25",
      });
    x.pubs.push({
      id: "p",
      title: "Version 2",
      state: "draft",
      item_ids: [child],
    });
    const plan = x.gov.preview(
      root,
      { start_date: "2026-11-01", end_date: "2026-11-30" },
      true,
    );
    assert.equal(plan.children.length, 2);
    assert.equal(plan.changes.length, 2);
    assert.equal(plan.children.find((c) => c.id === done).shifted, false);
    assert.equal(plan.dependencies.find((d) => d.id === dep).conflict, true);
    assert.equal(plan.publications.length, 1);
    x.gov.validatePlan({
      id: root,
      patch: plan.changes[0].patch,
      cascade: true,
      token: plan.token,
    });
    x.store.applyChanges(plan.changes, {
      actor: "Marie",
      reason: "Report validé",
    });
    assert.equal(
      x.store.list().find((i) => i.id === child).start_date,
      "2026-11-02",
    );
    assert.equal(
      x.store.list().find((i) => i.id === done).start_date,
      "2026-10-02",
    );
    const h = x.store.history.list(root)[0];
    assert.equal(h.actor, "Marie");
    assert.equal(h.reason, "Report validé");
    const undo = x.store.history.undo(h.id, x.store.list());
    assert.equal(undo.length, 2);
    x.store.applyChanges(undo, { undo_of: h.id, actor: "Marie" });
    assert.equal(
      x.store.list().find((i) => i.id === child).start_date,
      "2026-10-02",
    );
    assert.throws(() => x.store.history.undo(h.id, x.store.list()));
  } finally {
    x.store.db.close();
  }
});
test("Stale impacts and invalid batch changes cannot partially modify a roadmap", () => {
  const x = setup();
  try {
    const id = x.store.save({
      ...basic,
      start_date: "2026-10-01",
      end_date: "2026-10-10",
    });
    const patch = { start_date: "2026-11-01", end_date: "2026-11-10" },
      plan = x.gov.preview(id, patch);
    x.pubs.push({ id: "new", item_ids: [id], state: "draft" });
    assert.throws(
      () => x.gov.validatePlan({ id, patch, token: plan.token }),
      /changé/,
    );
    const old = x.store.list();
    assert.throws(() =>
      x.store.applyChanges([
        { id, patch },
        { id: "missing", patch },
      ]),
    );
    assert.deepEqual(x.store.list(), old);
    assert.equal(x.store.history.list(id).length, 0);
    assert.doesNotThrow(() =>
      planningImpact(old, [], id, { start_date: null, end_date: null }),
    );
  } finally {
    x.store.db.close();
  }
});
test("Undo retains unrelated edits and rejects changed-back values from a newer decision", () => {
  const x = setup();
  try {
    const id = x.store.save(basic);
    x.store.save({ priority: "high" }, id);
    const h = x.store.history.list(id)[0];
    x.store.save({ owner: "Marie" }, id);
    const changes = x.store.history.undo(h.id, x.store.list());
    x.store.applyChanges(changes, { undo_of: h.id });
    assert.equal(x.store.list()[0].owner, "Marie");
    assert.equal(x.store.list()[0].priority, "medium");
    x.store.save({ priority: "high" }, id);
    const latest = x.store.history.list(id)[0];
    x.store.save({ priority: "low" }, id);
    x.store.save({ priority: "high" }, id);
    assert.throws(
      () => x.store.history.undo(latest.id, x.store.list()),
      /récent/,
    );
  } finally {
    x.store.db.close();
  }
});
test("Reordering and Kanban status changes keep a reversible grouped history", () => {
  const x = setup();
  try {
    const a = x.store.save({ ...basic, title: "A" }),
      b = x.store.save({ ...basic, title: "B" });
    x.store.reorder(b, a, false);
    const h = x.store.history.list(b)[0];
    assert.equal(h.reason, "Réorganisation du Gantt");
    x.store.applyChanges(x.store.history.undo(h.id, x.store.list()), {
      undo_of: h.id,
    });
    assert.deepEqual(
      x.store.list().map((i) => i.id),
      [a, b],
    );
    x.store.reorderKanban([
      { id: "planned", ids: [a] },
      { id: "progress", ids: [] },
      { id: "done", ids: [b] },
    ]);
    const kh = x.store.history.list(b)[0];
    assert.equal(kh.after.status, "done");
    x.store.applyChanges(x.store.history.undo(kh.id, x.store.list()), {
      undo_of: kh.id,
    });
    assert.equal(x.store.list().find((i) => i.id === b).status, "planned");
  } finally {
    x.store.db.close();
  }
});
test("Contradictions cite exact current notes, can be dismissed and reappear when the planning changes", () => {
  const x = setup();
  try {
    const id = x.store.save({
        ...basic,
        start_date: "2026-10-01",
        end_date: "2026-10-20",
      }),
      note = x.notes.save({
        text: "Validé avec Clément : on reporte en novembre 2026.",
      });
    x.decisions.propose(
      [
        {
          title: "Report",
          reason: "Validation",
          kind: "defer",
          note_id: note.id,
          quote: note.text,
          item_ids: [id],
        },
      ],
      { items: x.store.list(), notes: x.notes.list() },
    );
    let rows = x.gov.contradictions();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sources[0].title, note.text);
    assert.match(rows[0].reason, /reste à confirmer/);
    x.gov.dismiss(rows[0].fingerprint);
    assert.equal(x.gov.contradictions().length, 0);
    x.store.save({ end_date: "2026-10-25" }, id);
    assert.equal(x.gov.contradictions().length, 1);
    x.store.save({ end_date: "2026-11-25" }, id);
    assert.equal(x.gov.contradictions().length, 0);
    x.store.save({ end_date: "2026-10-25" }, id);
    x.notes.save({ text: "Le report n’est plus envisagé." }, note.id);
    assert.equal(x.gov.contradictions().length, 0);
  } finally {
    x.store.db.close();
  }
});
test("A merged PR is never delivery proof; published linked releases only prompt a scope check", () => {
  const x = setup();
  try {
    const id = x.store.save(basic);
    x.signals.push({
      id: "pr",
      kind: "pull_request",
      state: "merged",
      title: "PR",
      links: [id],
      updated: "2099-01-01",
    });
    assert.equal(x.gov.contradictions().length, 0);
    x.signals.push({
      id: "release",
      kind: "release",
      state: "published",
      title: "v2",
      links: [id],
      updated: "2099-01-01",
      url: "https://github.com/test/product/releases/v2",
    });
    assert.equal(x.gov.contradictions().length, 1);
    assert.match(x.gov.contradictions()[0].reason, /ne prouve pas/);
    x.store.save({ status: "done" }, id);
    assert.equal(x.gov.contradictions().length, 0);
  } finally {
    x.store.db.close();
  }
});
