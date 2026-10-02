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
