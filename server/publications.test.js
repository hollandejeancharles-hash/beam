import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createPublications, publicPublications } from "./publications.js";
function setup() {
  const store = createStore(":memory:");
  const service = createPublications(
    store,
    {
      status: async () => ({ enabled: true, available: true, installed: true }),
    },
    async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            title: "Un éditeur amélioré",
            body: "Le nouvel éditeur est disponible.",
          }),
        },
      }),
    }),
  );
  return { store, service };
}
const item = {
  title: "Nouvel éditeur",
  description: "Un nouvel éditeur de contenu.",
  category: "Éditeur",
  priority: "medium",
  status: "done",
  visibility: "public",
  quarter: "T4 2026",
  type: "feature",
};
test("Publications: only explicit publication exposes an allowlisted snapshot; retract/archive removes it", () => {
  const { store, service } = setup();
  try {
    const id = store.save(item);
    const draft = service.save({
      item_id: id,
      title: item.title,
      body: item.description,
      version: "v2",
    });
    assert.deepEqual(publicPublications(service.list()), []);
    service.transition(draft.id, "published");
    const visible = publicPublications(service.list());
    assert.equal(visible.length, 1);
    assert.deepEqual(
      Object.keys(visible[0]).sort(),
      ["id", "title", "body", "version", "published"].sort(),
    );
    assert.throws(
      () => service.save({ title: "changed" }, draft.id),
      /brouillon/,
    );
    service.transition(draft.id, "draft");
    assert.deepEqual(publicPublications(service.list()), []);
    service.save({ body: "Une annonce relue" }, draft.id);
    service.transition(draft.id, "published");
    service.transition(draft.id, "archived");
    assert.deepEqual(publicPublications(service.list()), []);
    service.transition(draft.id, "draft");
    service.remove(draft.id);
    assert.equal(service.list().length, 0);
  } finally {
    store.db.close();
  }
});
test("Publications: block empty, private, unshipped, archived or missing linked elements", () => {
  const { store, service } = setup();
  try {
    const empty = service.save({});
    assert.throws(() => service.transition(empty.id, "published"), /titre/);
    for (const patch of [
      { visibility: "private" },
      { status: "planned" },
      { archived: 1 },
    ]) {
      const id = store.save({ ...item, ...patch });
      if (patch.archived) store.archive(id, true);
      if (patch.archived) {
        assert.throws(() => service.save({ item_id: id }), /introuvable/);
        continue;
      }
      const draft = service.save({
        item_id: id,
        title: "Titre",
        body: "Annonce",
      });
      assert.throws(
        () => service.transition(draft.id, "published"),
        /livré et public/,
      );
    }
    assert.throws(() => service.save({ title: "x".repeat(181) }), /long/);
    assert.throws(
      () => service.save({ item_id: "nonexistent" }),
      /introuvable/,
    );
    assert.throws(() => service.transition(empty.id, "other"), /invalide/);
  } finally {
    store.db.close();
  }
});
test("Publications: local AI proposes text without saving or publishing it", async () => {
  const { store, service } = setup();
  try {
    const id = store.save(item);
    const proposal = await service.generate({ item_id: id });
    assert.equal(proposal.title, "Un éditeur amélioré");
    assert.equal(service.list().length, 0);
    store.save({ ...item, status: "planned" }, id);
    await assert.rejects(service.generate({ item_id: id }), /livré/);
  } finally {
    store.db.close();
  }
});
