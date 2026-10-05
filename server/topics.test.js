import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createTopics } from "./topics.js";
test("topics group grounded sources, mark ambiguity and preserve manual moves without editing roadmap", async () => {
  const store = createStore(":memory:"),
    notes = createNotes(store);
  store.db.exec(
    "CREATE TABLE ai_reviews(entity_id TEXT,state TEXT,created TEXT,result TEXT)",
  );
  const a = notes.save({ text: "Axis permissions" }),
    b = notes.save({ text: "Review permissions" });
  let result = {
    topics: [
      {
        title: "Permissions",
        summary: "Deux échanges sur les permissions.",
        questions: ["Quel rôle est concerné ?"],
        members: [
          { id: "note:" + a.id, confidence: "clear" },
          { id: "note:" + b.id, confidence: "review" },
        ],
      },
    ],
  };
  const service = createTopics(
    store,
    notes,
    { signals: () => [] },
    { status: async () => ({ enabled: true }), busy: () => false },
    {
      fetcher: async (url, options) => {
        assert.equal(url, "http://127.0.0.1:11434/api/chat");
        assert.equal(options.redirect, "error");
        return {
          ok: true,
          json: async () => ({ message: { content: JSON.stringify(result) } }),
        };
      },
    },
  );
  await service.refresh();
  const t = service.list().topics[0];
  assert.equal(t.sources.length, 2);
  assert.equal(service.list().unassigned.length, 1);
  assert.equal(store.list().length, 0);
  service.move("note:" + b.id, null);
  await service.refresh();
  assert.equal(service.list().topics[0].sources.length, 1);
  assert.equal(
    store.db
      .prepare("SELECT locked FROM topic_members WHERE source=?")
      .get("note:" + b.id).locked,
    1,
  );
  result = {
    topics: [
      {
        title: "Bad",
        summary: "Bad",
        questions: [],
        members: [{ id: "invented", confidence: "clear" }],
      },
    ],
  };
  notes.save({ text: "Changed Axis permissions" }, a.id);
  await service.refresh();
  assert.match(service.list().error, /Source invalide/);
  assert.equal(service.list().topics.length, 1);
  store.db.close();
});

test("smart folders allow overlapping notes, preserve explicit corrections and hide without losing notes", async () => {
  const store = createStore(":memory:");
  const notes = createNotes(store);
  store.db.exec(
    "CREATE TABLE ai_reviews(entity_id TEXT,state TEXT,created TEXT,result TEXT)",
  );
  const a = notes.save({ text: "Le board est lent pendant l'édition" });
  const b = notes.save({ text: "Améliorer l'édition du board" });
  const c = notes.save({
    text: "Les performances du board doivent progresser",
  });
  const service = createTopics(
    store,
    notes,
    { signals: () => [] },
    { status: async () => ({ enabled: true }), busy: () => false },
    {
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              topics: [
                {
                  title: "Édition",
                  summary: "Échanges sur l'édition",
                  questions: [],
                  members: [a, b].map((n) => ({
                    id: "note:" + n.id,
                    confidence: "clear",
                  })),
                },
                {
                  title: "Performance",
                  summary: "Échanges sur les performances",
                  questions: [],
                  members: [a, c].map((n) => ({
                    id: "note:" + n.id,
                    confidence: "clear",
                  })),
                },
              ],
            }),
          },
        }),
      }),
    },
  );
  await service.refresh();
  const folders = service.list().topics;
  assert.equal(folders.length, 2);
  assert.ok(
    folders.every((t) => t.sources.some((s) => s.id === "note:" + a.id)),
  );
  service.hide(folders[0].id, true);
  assert.equal(
    service.list().topics.find((t) => t.id === folders[0].id).hidden,
    true,
  );
  assert.equal(notes.list().length, 3);
  service.move("note:" + a.id, folders[0].id);
  assert.equal(
    service
      .list()
      .topics.find((t) => t.id === folders[1].id)
      .sources.some((s) => s.id === "note:" + a.id),
    false,
  );
  service.merge(folders[1].id, folders[0].id);
  assert.equal(
    new Set(service.list().topics[0].sources.map((s) => s.id)).size,
    3,
  );
  store.db.close();
});

test("compact model identifiers persist as original note sources", async () => {
  const store = createStore(":memory:"),
    notes = createNotes(store);
  store.db.exec(
    "CREATE TABLE ai_reviews(entity_id TEXT,state TEXT,created TEXT,result TEXT)",
  );
  const a = notes.save({ text: "Permissions for the product" }),
    b = notes.save({ text: "Review product permissions" });
  let signalDate = "2099-01-01";
  const service = createTopics(
    store,
    notes,
    {
      signals: () =>
        Array.from({ length: 20 }, (_, index) => ({
          id: String(index),
          kind: "github",
          title: "Recent release",
          updated: signalDate,
          body: "Change",
        })),
    },
    { status: async () => ({ enabled: true }), busy: () => false },
    {
      fetcher: async (url, options) => {
        const request = JSON.parse(options.body);
        const prompt = JSON.parse(request.messages.at(-1).content);
        assert.ok(prompt.sources.every((source) => /^s\d+$/.test(source.id)));
        assert.equal(prompt.sources.length, 2);
        signalDate = "2099-02-01"; // An unrelated integration update must not discard the notes.
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({
                topics: [
                  {
                    title: "Permissions",
                    summary: "Product permissions",
                    questions: [],
                    members: prompt.sources.map((source) => ({
                      id: source.id,
                      confidence: "clear",
                    })),
                  },
                ],
              }),
            },
          }),
        };
      },
    },
  );
  await service.refresh();
  assert.deepEqual(
    service
      .list()
      .topics[0].sources.map((source) => source.id)
      .sort(),
    ["note:" + a.id, "note:" + b.id].sort(),
  );
  store.db.close();
});
