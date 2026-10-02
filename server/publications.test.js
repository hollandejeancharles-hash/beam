import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createPublications, publicPublications } from "./publications.js";
const sha = "a".repeat(40),
  release = {
    id: "release",
    source_id: "repo",
    provider: "github",
    kind: "release",
    state: "published",
    title: "v2",
    body: "Release",
    extra: { version: "v2" },
  };
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
const editorial = {
  release_id: "release",
  base_ref: "v1",
  sources: [{ id: "commit:" + sha, kind: "commit", title: "Nouvel éditeur" }],
};
function setup() {
  const store = createStore(":memory:");
  const integrations = {
    signals: () => [release],
    list: () => [],
    releaseLogs: async () => ({
      release_id: "release",
      source_id: "repo",
      version: "v2",
      base_ref: "v1",
      base_sha: "b".repeat(40),
      head_sha: sha,
      commits: [{ sha, message: "Nouvel éditeur" }],
    }),
  };
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
            entries: [
              {
                section: "Nouveautés",
                text: "Le nouvel éditeur est disponible.",
                evidence: [
                  { source_id: "commit:" + sha, quote: "Nouvel éditeur" },
                ],
              },
            ],
          }),
        },
      }),
    }),
    { integrations },
  );
  return { store, service };
}
test("Publications: validated version release notes expose only public fields and can be retracted or archived", () => {
  const { store, service } = setup();
  try {
    const id = store.save(item);
    const draft = service.save({
      ...editorial,
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
    service.save({ body: "Annonce relue" }, draft.id);
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
test("Publications: block generation without a version and publication without version logs or delivered public context", async () => {
  const { store, service } = setup();
  try {
    await assert.rejects(service.generate({ item_id: "x" }), /version GitHub/);
    const empty = service.save({});
    assert.throws(() => service.transition(empty.id, "published"), /titre/);
    const manual = service.save({ title: "Manuel", body: "Sans logs" });
    assert.throws(() => service.transition(manual.id, "published"), /par IA/);
    for (const patch of [{ visibility: "private" }, { status: "planned" }]) {
      const id = store.save({ ...item, ...patch });
      const draft = service.save({
        ...editorial,
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
  } finally {
    store.db.close();
  }
});
test("Publications: local AI proposes version-scoped text without saving or publishing it", async () => {
  const { store, service } = setup();
  try {
    const proposal = await service.generate({ release_id: "release" });
    assert.equal(proposal.title, "Les nouveautés de v2");
    assert.match(proposal.body, /Nouveautés/);
    assert.equal(proposal.base_ref, "v1");
    assert.equal(service.list().length, 0);
  } finally {
    store.db.close();
  }
});
