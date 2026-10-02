import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { releaseContext, validateReleaseAnswer } from "./release-notes.js";
import { createPublications, publicPublications } from "./publications.js";
const sha = "a".repeat(40);
const feature = {
  title: "Recherche de contenu",
  description: "Retrouvez vos contenus par mot-clé.",
  category: "Contenu",
  priority: "medium",
  status: "done",
  visibility: "public",
  quarter: "T4 2026",
  type: "feature",
};
function setup() {
  const store = createStore(":memory:");
  const id = store.save(feature),
    second = store.save({ ...feature, title: "Export PDF" });
  let noteRows = [
    {
      id: "feedback",
      text: "Les clients retrouvent leurs contenus plus facilement.",
      state: "active",
      linked: [id],
    },
  ];
  let signalRows = [
    {
      id: "release",
      source_id: "repo",
      provider: "github",
      kind: "release",
      state: "published",
      title: "v2.4",
      body: "Recherche livrée (#12).",
      extra: { version: "v2.4" },
      links: [],
    },
    {
      id: "pr",
      source_id: "repo",
      external_id: "12",
      provider: "github",
      kind: "pr",
      state: "merged",
      title: "Recherche par mot-clé",
      body: "Recherche de contenu",
      links: [id],
    },
    {
      id: "open",
      source_id: "repo",
      external_id: "13",
      provider: "github",
      kind: "pr",
      state: "open",
      title: "Future fonction",
      body: "Future fonction",
      links: [id],
    },
    {
      id: "other",
      provider: "github",
      kind: "commit",
      title: "Une autre fonction",
      body: "autre",
      links: [second],
    },
  ];
  const logs = {
    release_id: "release",
    source_id: "repo",
    version: "v2.4",
    base_ref: "v2.3",
    base_sha: "b".repeat(40),
    head_sha: sha,
    commits: [{ sha, message: "Recherche de contenu (#12)" }],
  };
  const notes = { list: () => noteRows },
    integrations = {
      signals: () => signalRows,
      list: () => [],
      releaseLogs: async () => logs,
    };
  return {
    store,
    logs,
    id,
    second,
    notes,
    integrations,
    setNotes: (v) => (noteRows = v),
    setSignals: (v) => (signalRows = v),
  };
}
test("Release note scope combines delivered Gantt items with only their notes and completed GitHub evidence", () => {
  const f = setup();
  try {
    const context = releaseContext(
      f.store,
      f.notes,
      f.integrations,
      { release_id: "release", item_ids: [f.id] },
      f.logs,
    );
    assert.deepEqual(
      context.sources.map((s) => s.id).sort(),
      [
        "commit:" + sha,
        "item:" + f.id,
        "note:feedback",
        "signal:pr",
        "signal:release",
      ].sort(),
    );
    const release = releaseContext(
      f.store,
      f.notes,
      f.integrations,
      {
        item_ids: [],
        release_id: "release",
      },
      f.logs,
    );
    assert.equal(release.version, "v2.4");
    assert.ok(release.sources.some((s) => s.id === "signal:pr"));
    assert.ok(release.sources.some((s) => s.id === "note:feedback"));
    const scoped = releaseContext(
      f.store,
      f.notes,
      f.integrations,
      { release_id: "release", item_ids: [f.second] },
      f.logs,
    );
    assert.deepEqual(scoped.item_ids, [f.id]);
    f.store.save({ visibility: "private" }, f.id);
    assert.ok(
      !releaseContext(
        f.store,
        f.notes,
        f.integrations,
        { release_id: "release" },
        f.logs,
      ).sources.some((s) => s.id === "note:feedback"),
    );
  } finally {
    f.store.db.close();
  }
});
test("Structured release notes reject fabricated sources, invented quotes and claims without delivery evidence", () => {
  const f = setup();
  try {
    const context = releaseContext(
      f.store,
      f.notes,
      f.integrations,
      { release_id: "release", item_ids: [f.id] },
      f.logs,
    );
    const entry = {
      section: "Améliorations",
      text: "Retrouvez vos contenus par mot-clé.",
      evidence: [
        { source_id: "commit:" + sha, quote: "Recherche de contenu (#12)" },
        { source_id: "item:" + f.id, quote: feature.description },
        {
          source_id: "note:feedback",
          quote: "Les clients retrouvent leurs contenus plus facilement.",
        },
      ],
    };
    const result = validateReleaseAnswer({ entries: [entry] }, context);
    assert.match(result.body, /Améliorations\n• Retrouvez/);
    assert.equal(result.sources.length, 3);
    assert.throws(
      () =>
        validateReleaseAnswer(
          {
            entries: [
              { ...entry, evidence: [{ source_id: "invented", quote: "x" }] },
            ],
          },
          context,
        ),
      /étayée/,
    );
    assert.throws(
      () =>
        validateReleaseAnswer(
          {
            entries: [
              {
                ...entry,
                evidence: [
                  {
                    source_id: "item:" + f.id,
                    quote: "Recherche trois fois plus rapide",
                  },
                ],
              },
            ],
          },
          context,
        ),
      /étayée/,
    );
    assert.throws(
      () =>
        validateReleaseAnswer(
          {
            entries: [
              {
                ...entry,
                evidence: [
                  {
                    source_id: "note:feedback",
                    quote:
                      "Les clients retrouvent leurs contenus plus facilement.",
                  },
                ],
              },
            ],
          },
          context,
        ),
      /commit/,
    );
    assert.throws(
      () => validateReleaseAnswer({ entries: [entry, entry] }, context),
      /doublons/,
    );
  } finally {
    f.store.db.close();
  }
});
test("Multi-feature drafts persist private source metadata and every selected feature is checked before publication", () => {
  const f = setup();
  try {
    const service = createPublications(
      f.store,
      { status: async () => ({}) },
      fetch,
      { notes: f.notes, integrations: f.integrations },
    );
    const draft = service.save({
      item_ids: [f.id, f.second],
      release_id: "release",
      base_ref: "v2.3",
      title: "Nouveautés",
      body: "Une version disponible",
      sources: [
        { id: "commit:" + sha, kind: "commit", title: "Recherche" },
        { id: "note:feedback", kind: "note", title: "Échange client privé" },
      ],
    });
    assert.deepEqual(service.list()[0].item_ids, [f.id, f.second]);
    f.store.save({ status: "planned" }, f.second);
    assert.throws(
      () => service.transition(draft.id, "published"),
      /livré et public/,
    );
    f.store.save({ status: "done" }, f.second);
    service.transition(draft.id, "published");
    const visible = publicPublications(service.list())[0];
    assert.equal(visible.sources, undefined);
    assert.equal(visible.item_ids, undefined);
    assert.equal(visible.release_id, undefined);
    assert.ok(!JSON.stringify(visible).includes("Échange client privé"));
  } finally {
    f.store.db.close();
  }
});
test("Changed sources during model generation never replace a draft", async () => {
  const f = setup();
  try {
    const service = createPublications(
      f.store,
      {
        status: async () => ({
          enabled: true,
          available: true,
          installed: true,
        }),
      },
      async () => {
        f.setNotes([
          {
            id: "feedback",
            text: "Le besoin a changé.",
            state: "active",
            linked: [f.id],
          },
        ]);
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify({
                entries: [
                  {
                    section: "Nouveautés",
                    text: "Recherche par mot-clé.",
                    evidence: [
                      {
                        source_id: "commit:" + sha,
                        quote: "Recherche de contenu (#12)",
                      },
                    ],
                  },
                ],
              }),
            },
          }),
        };
      },
      { notes: f.notes, integrations: f.integrations },
    );
    const draft = service.save({
      item_ids: [f.id],
      title: "Mon texte",
      body: "À conserver",
    });
    await assert.rejects(
      service.generate({ release_id: "release" }),
      /sources ont changé/,
    );
    assert.equal(service.list()[0].body, "À conserver");
    assert.equal(service.list()[0].id, draft.id);
  } finally {
    f.store.db.close();
  }
});
