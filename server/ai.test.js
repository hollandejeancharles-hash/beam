import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createIntegrations } from "./integrations.js";
import { createAI, validateAnswer, AI_MODEL } from "./ai.js";
const item = {
  title: "Prévisualisation en temps réel",
  description: "Voir la page avant publication.",
  category: "Éditeur",
  priority: "medium",
  status: "progress",
  visibility: "private",
  quarter: "T4 2026",
};
const result = (n, id) => ({
  summary: "Un blocage mobile à traiter.",
  classification: {
    kind: "feedback",
    people: ["Sarah"],
    tags: ["preview"],
    due: null,
    linked: [id],
  },
  proposals: [
    {
      action: "update",
      item_id: id,
      title: item.title,
      description: "Corriger le blocage de la prévisualisation mobile.",
      priority: "high",
      category: "Éditeur",
      reason: "Sarah signale un blocage.",
      note_ids: [n.id],
      signal_ids: [],
    },
  ],
});
async function ready(ai, id) {
  for (let i = 0; i < 100; i++) {
    const r = ai.list().find((r) => r.id === id);
    if (["ready", "error"].includes(r.state)) return r;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("Review did not finish");
}
function setup() {
  const store = createStore(":memory:"),
    notes = createNotes(store),
    integrations = createIntegrations(store);
  const id = store.save(item),
    n = notes.save({
      text: "Sarah : la preview mobile bloque la publication. Priorité haute.",
    });
  let answer = result(n, id),
    fail = false;
  const fetcher = async (url, options) => {
    assert.ok(url.startsWith("http://127.0.0.1:11434/"));
    assert.equal(options.redirect, "error");
    if (fail) throw Error("Offline");
    if (url.endsWith("/api/tags"))
      return { ok: true, json: async () => ({ models: [{ name: AI_MODEL }] }) };
    const request = JSON.parse(options.body);
    assert.equal(request.model, AI_MODEL);
    assert.equal(request.stream, true);
    assert.ok(request.format.properties);
    assert.equal(request.tools, undefined);
    return {
      ok: true,
      json: async () => ({
        message: { content: JSON.stringify(answer) },
        done: true,
      }),
    };
  };
  const ai = createAI(store, notes, integrations, { fetcher });
  return {
    store,
    notes,
    integrations,
    ai,
    id,
    n,
    setAnswer: (v) => (answer = v),
    offline: () => (fail = true),
  };
}
test("local analysis produces reviewable suggestions and never changes notes or roadmap before approval", async () => {
  const t = setup();
  try {
    assert.throws(() => t.ai.enqueue("note", t.n.id), /Activez/);
    t.ai.configure(true);
    const r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    assert.equal(r.state, "ready");
    assert.equal(t.store.list()[0].priority, "medium");
    assert.equal(t.notes.list()[0].kind, t.n.kind);
    t.ai.apply(r.id, "classification");
    assert.deepEqual(t.notes.list()[0].people, ["Sarah"]);
    t.ai.apply(r.id, 0);
    const changed = t.store.list()[0];
    assert.equal(changed.priority, "high");
    assert.equal(changed.status, "progress");
    assert.equal(changed.visibility, "private");
    assert.ok(
      changed.description.endsWith(
        "Corriger le blocage de la prévisualisation mobile.",
      ),
    );
    assert.throws(() => t.ai.apply(r.id, 0), /déjà/);
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("rejects hallucinated IDs, invalid dates, ungrounded proposals and unsupported fields", () => {
  const t = setup();
  try {
    const c = { items: t.store.list(), notes: [t.n], signals: [] };
    for (const mutate of [
      (a) => (a.classification.linked = ["unknown"]),
      (a) => (a.classification.due = "2026-02-31"),
      (a) => (a.proposals[0].note_ids = ["unknown"]),
      (a) => (a.proposals[0].signal_ids = ["unknown"]),
      (a) => (a.proposals[0].note_ids = []),
      (a) => (a.proposals[0].priority = "urgent"),
    ]) {
      const a = result(t.n, t.id);
      mutate(a);
      assert.throws(() => validateAnswer(a, c), /invalide/);
    }
    const a = result(t.n, t.id);
    a.proposals[0].status = "done";
    a.proposals[0].visibility = "public";
    const clean = validateAnswer(a, c);
    assert.equal(clean.proposals[0].status, undefined);
    assert.equal(clean.proposals[0].visibility, undefined);
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("stale note and feature proposals cannot overwrite subsequent manual changes", async () => {
  const t = setup();
  try {
    t.ai.configure(true);
    const r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    t.store.save({ priority: "low" }, t.id);
    assert.throws(() => t.ai.apply(r.id, 0), /feature a changé/);
    assert.equal(t.store.list()[0].priority, "low");
    t.notes.save({ text: "Une autre note" }, t.n.id);
    assert.throws(
      () => t.ai.apply(r.id, "classification"),
      /note a été modifiée/,
    );
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("new features stay private, preserve original notes, and carry their source links", async () => {
  const t = setup();
  try {
    const a = result(t.n, t.id);
    a.proposals[0].action = "create";
    a.proposals[0].item_id = null;
    a.proposals[0].title = "Corriger la preview mobile";
    t.setAnswer(a);
    t.ai.configure(true);
    const r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    t.ai.apply(r.id, 0);
    const created = t.store.list().find((i) => i.id !== t.id);
    assert.equal(created.visibility, "private");
    assert.equal(created.status, "planned");
    assert.equal(t.store.list(true).length, 0);
    assert.equal(t.notes.list()[0].text, t.n.text);
    assert.ok(t.notes.list()[0].linked.includes(created.id));
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("model failure retains note and does not call cloud or modify roadmap", async () => {
  const t = setup();
  try {
    t.offline();
    t.ai.configure(true);
    const r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    assert.equal(r.state, "error");
    assert.equal(t.notes.list()[0].text, t.n.text);
    assert.equal(t.store.list()[0].priority, "medium");
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("feature analysis uses only explicitly associated notes and signals", async () => {
  const t = setup();
  try {
    t.ai.configure(true);
    assert.throws(
      () => t.ai.enqueue("feature", t.id),
      /Aucune source pertinente/,
    );
    t.notes.save({ classification: { linked: [t.id] } }, t.n.id);
    t.notes.save({ text: "Note indépendante" });
    const r = await ready(t.ai, t.ai.enqueue("feature", t.id).id);
    assert.equal(r.context.notes.length, 1);
    assert.equal(r.context.notes[0].id, t.n.id);
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("a rejected oversized update rolls back priority, note associations and review approval", async () => {
  const t = setup();
  try {
    t.store.save({ description: "x".repeat(4999) }, t.id);
    t.ai.configure(true);
    const r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    assert.throws(() => t.ai.apply(r.id, 0), /invalides/);
    assert.equal(t.store.list()[0].priority, "medium");
    assert.equal(t.store.list()[0].description.length, 4999);
    assert.deepEqual(t.notes.list()[0].linked, t.n.linked);
    assert.equal(t.ai.list()[0].result.proposals[0].applied, undefined);
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("multiple suggestions for one feature become one approval with combined evidence", () => {
  const t = setup();
  try {
    const a = result(t.n, t.id);
    a.proposals.push({
      ...a.proposals[0],
      description: "Relancer Sarah.",
      priority: null,
    });
    const clean = validateAnswer(a, {
      items: t.store.list(),
      notes: [t.n],
      signals: [],
    });
    assert.equal(clean.proposals.length, 1);
    assert.ok(clean.proposals[0].description.includes("Relancer Sarah."));
    assert.deepEqual(clean.proposals[0].note_ids, [t.n.id]);
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("note analysis excludes unrelated imported signals even when they mention the same product", async () => {
  const t = setup();
  try {
    const source = t.integrations.save({
      provider: "github",
      label: "Produit",
      url: "https://github.com/team/product",
    });
    const sid = source.id;
    t.store.db
      .prepare("INSERT INTO signals VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        "signal-1",
        sid,
        "1",
        "pr",
        "Preview product integration",
        "https://github.com/team/product/pull/1",
        "merged",
        "Unrelated change",
        new Date().toISOString(),
        "{}",
      );
    t.ai.configure(true);
    let r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    assert.equal(r.context.signals.length, 0);
    t.notes.save({ text: "Lire la PR #1" }, t.n.id);
    r = await ready(t.ai, t.ai.enqueue("note", t.n.id).id);
    assert.equal(r.context.signals.length, 1);
    assert.equal(r.context.signals[0].id, "signal-1");
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
test("saving a note never starts background analysis", async () => {
  const { store, ai, n } = setup();
  ai.configure(true);
  ai.auto(n);
  assert.equal(ai.list().length, 0);
  assert.equal(ai.busy(), false);
  ai.close();
  store.db.close();
});

test("AI extracts grounded decisions for human approval and receives only confirmed memory", async () => {
  const { createDecisions } = await import("./decisions.js");
  const store = createStore(":memory:"),
    notes = createNotes(store),
    integrations = createIntegrations(store),
    id = store.save(item);
  const n = notes.save({
    text: "Validé avec Sarah : reporter la prévisualisation mobile après la refonte.",
  });
  const decisions = createDecisions(store);
  const proposal = {
    title: "Reporter la prévisualisation mobile",
    reason: "Après la refonte",
    kind: "defer",
    note_id: n.id,
    quote: n.text,
    item_ids: [id],
  };
  let memorySeen = [];
  const fetcher = async (url, options) => {
    if (url.endsWith("/api/tags"))
      return { ok: true, json: async () => ({ models: [{ name: AI_MODEL }] }) };
    const payload = JSON.parse(options.body);
    memorySeen = JSON.parse(payload.messages[1].content).confirmed_decisions;
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            summary: "Un report acté.",
            classification: {
              kind: "decision",
              people: ["Sarah"],
              tags: [],
              due: null,
              linked: [id],
            },
            proposals: [],
            decisions: [proposal],
          }),
        },
        done: true,
      }),
    };
  };
  const ai = createAI(store, notes, integrations, { fetcher });
  ai.configure(true);
  const first = await ready(ai, ai.enqueue("note", n.id).id);
  assert.equal(first.state, "ready");
  assert.deepEqual(memorySeen, []);
  assert.equal(decisions.list()[0].state, "proposed");
  decisions.decide(decisions.list()[0].id, "confirmed");
  const second = await ready(ai, ai.enqueue("note", n.id).id);
  assert.equal(second.state, "ready");
  assert.equal(memorySeen[0].title, proposal.title);
  assert.equal(store.list()[0].priority, "medium");
  store.db.close();
});

test("Approved AI proposal uses shared save and remains unapplied on a remote conflict", async () => {
  const t = setup();
  try {
    t.ai.configure(true);
    const queued = t.ai.enqueue("note", t.n.id, true);
    await ready(t.ai, queued.id);
    const review = t.ai.list().find((r) => r.id === queued.id);
    await assert.rejects(
      t.ai.apply(review.id, 0, async () => {
        throw Error("BEAM_CONFLICT");
      }),
      /BEAM_CONFLICT/,
    );
    assert.equal(
      t.ai.list().find((r) => r.id === review.id).result.proposals[0].applied,
      undefined,
    );
    let saved;
    const applied = await t.ai.apply(review.id, 0, async (input, id) => {
      saved = { input, id };
      t.store.save(input, id);
      return id;
    });
    assert.equal(saved.id, t.id);
    assert.equal(applied.result.proposals[0].applied, true);
    assert.ok(t.notes.list()[0].linked.includes(t.id));
  } finally {
    t.ai.close();
    t.store.db.close();
  }
});
