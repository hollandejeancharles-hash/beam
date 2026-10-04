import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createIntegrations } from "./integrations.js";
import { createAssociations } from "./associations.js";
import { createAI, AI_MODEL } from "./ai.js";
const item = {
  title: "Zoom dans les boards",
  description: "Agrandir le board pour lire les détails.",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "private",
  quarter: "T4 2026",
};
function setup() {
  const store = createStore(":memory:"),
    notes = createNotes(store),
    integrations = createIntegrations(store);
  const id = store.save(item),
    n = notes.save({
      text: "Le zoom dans les boards est demandé pour lire les petits textes.",
    });
  notes.save({ classification: { linked: [] } }, n.id, { automatic: true });
  const source = integrations.save({
    provider: "github",
    label: "Produit",
    url: "https://github.com/example/product",
  });
  store.db
    .prepare("INSERT INTO signals VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(
      "pr-1",
      source.id,
      "1",
      "pr",
      "Zoom board",
      "https://github.com/example/product/pull/1",
      "open",
      "Ajout du zoom dans les boards.",
      "2026-10-02",
      "{}",
    );
  let answer = {
      matches: [
        {
          source: "note:" + n.id,
          item_id: id,
          confidence: "clear",
          reason: "Demande de zoom pour le board.",
          evidence: "Le zoom dans les boards",
        },
        {
          source: "signal:pr-1",
          item_id: id,
          confidence: "review",
          reason: "La portée de cette PR reste à confirmer.",
          evidence: "Ajout du zoom",
        },
      ],
    },
    calls = 0,
    mutate;
  const ai = {
    busy: () => false,
    status: async () => ({ enabled: true, installed: true }),
  };
  const associations = createAssociations(store, notes, integrations, ai, {
    fetcher: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      assert.equal(options.redirect, "error");
      const request = JSON.parse(options.body);
      assert.equal(request.model, AI_MODEL);
      assert.equal(request.tools, undefined);
      calls++;
      mutate?.();
      return {
        ok: true,
        json: async () => ({ message: { content: JSON.stringify(answer) } }),
      };
    },
  });
  return {
    store,
    notes,
    integrations,
    associations,
    id,
    n,
    setAnswer: (v) => (answer = v),
    setMutation: (f) => (mutate = f),
    calls: () => calls,
  };
}
test("local discovery links clear sources, keeps ambiguity separate and caches unchanged content", async () => {
  const t = setup();
  try {
    await t.associations.refresh();
    assert.equal(t.associations.list().matches.length, 2);
    assert.ok(t.notes.list()[0].linked.includes(t.id));
    assert.equal(t.integrations.signals()[0].links.length, 0);
    const before = t.store.list();
    t.associations.decide("signal:pr-1", t.id, true);
    assert.ok(t.integrations.signals()[0].links.includes(t.id));
    assert.deepEqual(t.store.list(), before);
    t.integrations.link("pr-1", t.id);
    t.associations.decide("signal:pr-1", t.id, false);
    assert.deepEqual(t.integrations.signals()[0].links, []);
    await t.associations.refresh();
    assert.equal(t.calls(), 1);
  } finally {
    t.store.db.close();
  }
});
test("manual rejection survives automatic rediscovery and note classification", async () => {
  const t = setup();
  try {
    await t.associations.refresh();
    t.associations.decide("note:" + t.n.id, t.id, false);
    t.notes.save({ text: t.n.text + " Urgent." }, t.n.id);
    await t.associations.refresh();
    t.notes.save({ classification: { linked: [t.id] } }, t.n.id, {
      automatic: true,
    });
    assert.deepEqual(t.notes.list()[0].linked, []);
    t.notes.save({ classification: { linked: [t.id] } }, t.n.id);
    assert.ok(t.notes.list()[0].linked.includes(t.id));
  } finally {
    t.store.db.close();
  }
});
test("invented IDs or evidence and stale content cannot create associations", async () => {
  const t = setup();
  try {
    for (const bad of [
      { item_id: "invented", evidence: "Le zoom" },
      { item_id: t.id, evidence: "Citation inventée" },
    ]) {
      t.setAnswer({
        matches: [
          {
            source: "note:" + t.n.id,
            confidence: "clear",
            reason: "Justification",
            ...bad,
          },
        ],
      });
      await t.associations.refresh({ force: true });
      assert.equal(t.associations.list().matches.length, 0);
      assert.ok(t.associations.list().error);
    }
    t.setAnswer({
      matches: [
        {
          source: "note:" + t.n.id,
          item_id: t.id,
          confidence: "clear",
          reason: "Demande de zoom",
          evidence: "Le zoom",
        },
      ],
    });
    t.setMutation(() => t.notes.save({ text: "Source modifiée" }, t.n.id));
    await t.associations.refresh({ force: true });
    assert.equal(t.associations.list().matches.length, 0);
    assert.match(t.associations.list().error, /changé/);
  } finally {
    t.store.db.close();
  }
});
test("feature analysis discovers its sources before building a grounded review", async () => {
  const t = setup();
  let ai;
  try {
    ai = createAI(t.store, t.notes, t.integrations, {
      fetcher: async (url) =>
        url.endsWith("tags")
          ? { ok: true, json: async () => ({ models: [{ name: AI_MODEL }] }) }
          : {
              ok: true,
              json: async () => ({
                message: {
                  content: JSON.stringify({
                    summary: "Besoin de zoom.",
                    classification: {
                      kind: "feedback",
                      people: [],
                      tags: [],
                      due: null,
                      linked: [t.id],
                    },
                    proposals: [],
                  }),
                },
                done: true,
              }),
            },
    });
    ai.setDiscovery(() => t.associations.refresh({ force: true }));
    ai.configure(true);
    const queued = ai.enqueue("feature", t.id);
    for (let i = 0; i < 100; i++) {
      const r = ai.list().find((r) => r.id === queued.id);
      if (r.state === "ready") {
        assert.equal(r.context.notes[0].id, t.n.id);
        assert.equal(r.context.signals.length, 0);
        return;
      }
      if (r.state === "error") assert.fail(r.error);
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.fail("Analysis timed out");
  } finally {
    ai?.close();
    t.store.db.close();
  }
});
test("unchanged failed discovery waits before retrying, while explicit retries and changed sources remain available", async () => {
  const t = setup();
  try {
    t.setAnswer({
      matches: [
        {
          source: "note:" + t.n.id,
          item_id: "invented",
          confidence: "clear",
          reason: "invalid",
          evidence: "Le zoom",
        },
      ],
    });
    await t.associations.refresh();
    assert.equal(t.calls(), 1);
    await t.associations.refresh();
    assert.equal(t.calls(), 1);
    await t.associations.refresh({ force: true });
    assert.equal(t.calls(), 2);
    t.notes.save({ text: t.n.text + " Nouvelle précision." }, t.n.id);
    await t.associations.refresh();
    assert.equal(t.calls(), 3);
  } finally {
    t.store.db.close();
  }
});
