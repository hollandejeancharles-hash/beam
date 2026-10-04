import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createProductFlows } from "./product-flows.js";
import { replaceItems } from "./collaboration.js";
import { publicRoadmap } from "../scripts/public-roadmap.js";
const base = {
  title: "Éditeur",
  description: "Test",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "public",
  quarter: "T4 2026",
  start_date: "2026-10-01",
  end_date: "2026-10-10",
};
function setup() {
  const store = createStore(":memory:");
  let sources = [
    {
      id: "note:1",
      title: "Les éditeurs mettent trop de temps à publier.",
      body: "Le problème concerne les éditeurs.",
      confidence: "clear",
      kind: "feedback",
      created: "2026-10-03T12:00:00Z",
    },
    {
      id: "note:2",
      title: "Signal ambigu",
      body: "Ne pas traiter",
      confidence: "review",
      kind: "idea",
      created: "2026-10-04T12:00:00Z",
    },
  ];
  let result = {
    problem: "La publication prend trop de temps.",
    users: "Éditeurs",
    outcome: "Réduire le temps de publication",
    questions: "Quel temps de référence ?",
    evidence: [
      {
        source_id: "note:1",
        quote: "Les éditeurs mettent trop de temps à publier.",
      },
    ],
  };
  let busy = false,
    enabled = true,
    pubs = [],
    signals = [],
    notes = [],
    onFetch = () => {};
  const flows = createProductFlows(
    store,
    {
      topics: {
        list: () => ({
          running: false,
          topics: [{ id: "topic", title: "Publication", sources }],
        }),
      },
      notes: { list: () => notes },
      integrations: { signals: () => signals },
      publications: { list: () => pubs },
      ai: { busy: () => busy, status: async () => ({ enabled }) },
    },
    {
      fetcher: async (url, options) => {
        assert.equal(url, "http://127.0.0.1:11434/api/chat");
        assert.equal(options.redirect, "error");
        const context = JSON.parse(
          JSON.parse(options.body).messages[1].content,
        );
        assert.equal(context.sources.length, 1);
        onFetch();
        return {
          ok: true,
          json: async () => ({ message: { content: JSON.stringify(result) } }),
        };
      },
    },
  );
  return {
    store,
    flows,
    setResult: (r) => (result = r),
    setSources: (s) => (sources = s),
    setBusy: (b) => (busy = b),
    setEnabled: (b) => (enabled = b),
    setPubs: (p) => (pubs = p),
    setNotes: (n) => (notes = n),
    setSignals: (s) => (signals = s),
    setOnFetch: (f) => (onFetch = f),
    result,
    sources,
  };
}
test("Results and delivery measures survive shared snapshots, history and stay private publicly", () => {
  const { store } = setup();
  const item = store.save({
    ...base,
    outcome: "Gain de temps",
    success_measure: "Temps médian",
    success_target: "10 minutes",
  });
  const other = createStore(":memory:");
  replaceItems(other, store.list());
  assert.equal(other.list()[0].success_target, "10 minutes");
  store.save(
    {
      outcome_result: "Retour confirmé",
      outcome_verdict: "mixed",
      outcome_reviewed_at: "2026-10-04T12:00:00Z",
    },
    item,
  );
  const h = store.history.list(item)[0];
  assert.equal(h.after.outcome_verdict, "mixed");
  store.applyChanges(store.history.undo(h.id, store.list()), { undo_of: h.id });
  assert.equal(store.list()[0].outcome_verdict, "unmeasured");
  assert.equal(store.list()[0].outcome, "Gain de temps");
  for (const row of [store.list(true)[0], publicRoadmap(store.list())[0]])
    for (const key of [
      "outcome",
      "success_target",
      "outcome_result",
      "brief_id",
    ])
      assert.equal(key in row, false);
  assert.throws(() => store.save({ outcome_verdict: "invented" }, item));
  store.db.close();
  other.db.close();
});
test("Local briefs use confirmed signals and exact evidence, remain drafts until human preparation", async () => {
  const x = setup(),
    b = await x.flows.generate("topic");
  assert.equal(b.stale, false);
  assert.equal(b.state, "draft");
  assert.equal(x.store.list().length, 0);
  const edited = x.flows.save(b.id, { problem: "Un problème relu" });
  assert.equal(edited.content.problem, "Un problème relu");
  const draft = x.flows.prepare(b.id);
  assert.equal(draft.brief_id, b.id);
  assert.equal(draft.outcome, "Réduire le temps de publication");
  assert.equal(x.store.list().length, 0);
  assert.equal(draft.description.includes("Les éditeurs mettent trop"), false);
  x.setSources([{ ...x.sources[0], title: "Source modifiée" }]);
  assert.equal(x.flows.get(b.id).stale, true);
  assert.throws(() => x.flows.prepare(b.id), /sources ont changé/);
  x.store.db.close();
});
test("Invalid AI evidence, concurrent source changes and unavailable assistant cannot persist a brief", async () => {
  const x = setup();
  x.setResult({
    ...x.result,
    evidence: [{ source_id: "note:2", quote: "Signal ambigu" }],
  });
  await assert.rejects(x.flows.generate("topic"), /preuve/);
  assert.equal(x.flows.list("topic").length, 0);
  x.setResult({
    ...x.result,
    evidence: [{ source_id: "note:1", quote: "Citation inventée" }],
  });
  await assert.rejects(x.flows.generate("topic"), /preuve/);
  x.setResult(x.result);
  x.setOnFetch(() =>
    x.setSources([{ ...x.sources[0], body: "Changement concurrent" }]),
  );
  await assert.rejects(x.flows.generate("topic"), /signaux ont changé/);
  x.setBusy(true);
  await assert.rejects(x.flows.generate("topic"), /déjà/);
  x.setBusy(false);
  x.setEnabled(false);
  await assert.rejects(x.flows.generate("topic"), /Activez/);
  assert.equal(x.flows.list("topic").length, 0);
  x.store.db.close();
});
test("Scenario comparison is non-mutating and evaluates dependencies against the complete projected roadmap", () => {
  const x = setup(),
    a = x.store.save({ ...base, type: "initiative" }),
    child = x.store.save({ ...base, title: "Zoom", parent_id: a }),
    b = x.store.save({
      ...base,
      title: "Suite",
      start_date: "2026-10-11",
      end_date: "2026-10-20",
      dependency_id: a,
    });
  x.setPubs([{ id: "p", item_ids: [a], title: "Publication" }]);
  const rows = [
    {
      id: a,
      patch: {
        start_date: "2026-11-01",
        end_date: "2026-11-10",
        priority: "high",
      },
    },
    { id: b, patch: { start_date: "2026-11-11", end_date: "2026-11-20" } },
  ];
  const p = x.flows.scenario(rows, true);
  assert.equal(x.store.list().find((i) => i.id === a).start_date, "2026-10-01");
  assert.equal(p.changes.length, 3);
  assert.equal(p.dependencies[0].conflict, false);
  assert.equal(p.publications.length, 1);
  assert.throws(
    () =>
      x.flows.scenario(
        [...rows, { id: child, patch: { priority: "high" } }],
        true,
      ),
    /deux fois/,
  );
  const validated = x.flows.validateScenario({
    rows,
    cascade: true,
    token: p.token,
  });
  x.store.applyChanges(validated.changes, { reason: "Scénario validé" });
  assert.equal(
    x.store.list().find((i) => i.id === child).start_date,
    "2026-11-01",
  );
  const h = x.store.history.list(a)[0];
  x.store.applyChanges(x.store.history.undo(h.id, x.store.list()), {
    undo_of: h.id,
  });
  assert.equal(x.store.list().find((i) => i.id === b).start_date, "2026-10-11");
  x.store.save({ owner: "Modification concurrente" }, a);
  assert.throws(
    () => x.flows.validateScenario({ rows, cascade: true, token: p.token }),
    /roadmap a changé/,
  );
  x.store.db.close();
});
test("Delivery review selects associated evidence after the observed delivery and admits unknown history explicitly", () => {
  const x = setup(),
    a = x.store.save(base);
  x.store.save({ status: "done" }, a);
  const done = x.store.history.list(a)[0].created;
  x.setNotes([
    {
      id: "before",
      text: "Avant",
      state: "inbox",
      linked: [a],
      created: "2020-01-01T00:00:00Z",
    },
    {
      id: "after",
      text: "Après",
      state: "inbox",
      linked: [a],
      created: "2090-01-01T00:00:00Z",
    },
    {
      id: "unrelated",
      text: "Autre",
      state: "inbox",
      linked: [],
      created: "2090-01-01T00:00:00Z",
    },
  ]);
  x.setSignals([
    {
      id: "release",
      title: "Version",
      links: [a],
      updated: "2090-01-02T00:00:00Z",
      kind: "release",
    },
  ]);
  const d = x.flows.delivery(a);
  assert.equal(d.since, done);
  assert.equal(d.sources.length, 2);
  assert.equal(
    d.sources.some((s) => s.id === "note:before"),
    false,
  );
  const old = x.store.save({
    ...base,
    title: "Livraison historique",
    status: "done",
  });
  assert.equal(x.flows.delivery(old).dated, false);
  x.store.db.close();
});
