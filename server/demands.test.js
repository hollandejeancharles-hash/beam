import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createDemands, demandHash, groundedDrafts } from "./demands.js";
function fixture(shared) {
  const store = createStore(":memory:"),
    personal = [
      {
        id: "note-a",
        text: "Le client veut exporter ses données. Mon aparté personnel.",
      },
    ];
  const collaboration = shared || {
    active: () => false,
    team: async () => ({ profiles: [] }),
  };
  return {
    store,
    personal,
    demands: createDemands(store, {
      collaboration,
      notes: { list: () => personal },
      ai: { busy: () => false, status: async () => ({ enabled: false }) },
    }),
  };
}
test("sharing notes requires an exact selected excerpt and unchanged source; unrelated personal text remains private", async () => {
  const { store, personal, demands } = fixture();
  const payload = {
    title: "Export",
    description: "Exporter les données",
    note_id: "note-a",
    note_hash: demandHash(personal[0].text),
    excerpt: "Le client veut exporter ses données.",
  };
  const request = await demands.create(payload);
  assert.equal(request.data.sources[0].quote, payload.excerpt);
  assert.ok(!JSON.stringify(request).includes("aparté"));
  await assert.rejects(
    demands.create({ ...payload, excerpt: "citation inventée" }),
  );
  personal[0].text += " Changement";
  await assert.rejects(demands.create(payload), /changé/);
  store.db.close();
});
test("public suggestions are imported once; triage reasons and optimistic revisions protect edits", async () => {
  const { store, demands } = fixture();
  store.suggest("Export", "Exporter le document");
  assert.equal((await demands.list()).demands.length, 1);
  const row = (await demands.list()).demands[0];
  await assert.rejects(
    demands.update(row.id, { revision: row.revision, state: "rejected" }),
    /pourquoi/,
  );
  await demands.update(row.id, { revision: row.revision, state: "clarify" });
  await assert.rejects(
    demands.update(row.id, { revision: row.revision, state: "review" }),
    /changé/,
  );
  assert.equal((await demands.list()).demands.length, 1);
  store.db.close();
});
test("merging retains both source histories, prevents stale merges and keeps the original demand", async () => {
  const { store, demands } = fixture();
  const a = await demands.create({ title: "A", description: "Export PDF" }),
    b = await demands.create({ title: "B", description: "Export en PDF" });
  await demands.merge({
    id: a.id,
    revision: a.revision,
    target_id: b.id,
    target_revision: b.revision,
    reason: "Même besoin",
  });
  const rows = (await demands.list()).demands;
  assert.equal(rows.find((x) => x.id === a.id).data.state, "merged");
  assert.equal(
    rows.find((x) => x.id === b.id).data.sources[0].quote,
    "Export PDF",
  );
  await assert.rejects(
    demands.merge({
      id: a.id,
      revision: 0,
      target_id: b.id,
      target_revision: 0,
      reason: "Encore",
    }),
  );
  store.db.close();
});
test("feature conversion is atomic, private by default, and rejects repeated or stale conversion", async () => {
  const { store, demands } = fixture();
  const a = await demands.create({ title: "Export", description: "PDF" });
  const body = {
    title: "Export",
    description: "PDF",
    category: "Éditeur",
    priority: "medium",
    status: "planned",
    visibility: "private",
    quarter: "T4 2026",
    _demand_id: a.id,
    _demand_revision: a.revision,
  };
  const id = demands.createFeature(body);
  assert.equal((await demands.list()).demands[0].data.item_id, id);
  assert.equal(store.list(true).length, 0);
  assert.throws(() => demands.createFeature(body), /changé/);
  assert.equal(store.list().length, 1);
  store.db.close();
});
test("AI citations and duplicate relationships must refer to real supplied content", () => {
  const result = {
    demands: [
      {
        title: "Export",
        description: "Besoin PDF",
        quote: "Exporter",
        related_id: "unknown",
        duplicate_id: "other",
        duplicate_quote: "PDF",
      },
    ],
  };
  const drafts = groundedDrafts(
    result,
    "Exporter un PDF",
    [],
    [{ id: "other", data: { description: "Exporter en PDF" } }],
  );
  assert.equal(drafts[0].related, null);
  assert.equal(drafts[0].duplicate_id, "other");
  assert.throws(() => groundedDrafts(result, "Autre source"), /citation/);
  assert.equal(
    groundedDrafts(result, "Exporter", [], [])[0].duplicate_id,
    null,
  );
});
test("shared workspaces never silently fall back to local writes when the server is unavailable", async () => {
  const { store, demands } = fixture({
    active: () => true,
    demands: async () => {
      throw Error("Hors ligne");
    },
    team: async () => ({ profiles: [] }),
  });
  await assert.rejects(
    demands.create({ title: "Export", description: "PDF" }),
    /Hors ligne/,
  );
  assert.equal(demands.cached().length, 0);
  store.db.close();
});
test("retrying a validated submission cannot create a second demand after an interrupted response", async () => {
  const { store, demands } = fixture(),
    payload = {
      request_id: "aa000000-0000-4000-8000-000000000001",
      title: "Export",
      description: "PDF",
    };
  const a = await demands.create(payload),
    b = await demands.create(payload);
  assert.equal(a.id, b.id);
  assert.equal(demands.cached().length, 1);
  await assert.rejects(
    demands.create({ ...payload, title: "Autre" }),
    /autre contenu/,
  );
  store.db.close();
});
test("a failed feature validation rolls back both the roadmap and the request", async () => {
  const { store, demands } = fixture();
  const a = await demands.create({ title: "Export", description: "PDF" });
  assert.throws(() =>
    demands.createFeature({
      title: "Export",
      _demand_id: a.id,
      _demand_revision: a.revision,
      category: "invalid",
    }),
  );
  assert.equal(store.list().length, 0);
  assert.equal(demands.cached()[0].data.state, "review");
  assert.equal(demands.cached()[0].revision, 0);
  store.db.close();
});
test("switching to a shared cache preserves the Mac's personal requests", async () => {
  let active = false;
  const { store, demands } = fixture({
    active: () => active,
    state: () => ({ workspace: { id: "team", role: "editor" } }),
    demands: async () => [],
    team: async () => ({ profiles: [] }),
  });
  const row = await demands.create({
    title: "Personal request",
    description: "Keep local",
  });
  active = true;
  assert.equal((await demands.list()).demands.length, 0);
  active = false;
  assert.equal((await demands.list()).demands[0].id, row.id);
  store.db.close();
});
test("a pasted manual source survives publishing and idempotent retries", async () => {
  const { store, demands } = fixture();
  const input = {
    request_id: "aa000000-0000-4000-8000-000000000002",
    title: "Export",
    description: "Need PDF",
    excerpt: "Customer asks for a PDF.",
  };
  const a = await demands.create(input),
    b = await demands.create(input);
  assert.equal(a.id, b.id);
  assert.equal(a.data.sources[0].quote, input.excerpt);
  store.db.close();
});
