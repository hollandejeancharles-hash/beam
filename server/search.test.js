import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchRecords,
  includesSearch,
  matchSearchContent,
} from "../shared/search.js";
const fixture = {
  items: [
    {
      id: "i",
      title: "Éditeur",
      description: "Publication multilingue",
      visibility: "public",
    },
    { id: "hidden", title: "Secret", visibility: "internal" },
    { id: "archive", title: "Ancien", visibility: "public", archived: 1 },
  ],
  notes: [
    {
      id: "n",
      text: "Échange avec Marie",
      people: ["Marie"],
      tags: ["Facturation"],
      state: "archived",
    },
  ],
  attachments: [
    {
      id: "a",
      note_id: "n",
      name: "Budget.pdf",
      text: "Prévision annuelle 2027",
    },
    { id: "orphan", note_id: "missing", name: "Inaccessible" },
  ],
  topics: [
    {
      id: "t",
      title: "Commerce",
      summary: "Clients internationaux",
      questions: ["Quels marchés ?"],
    },
  ],
  signals: [
    {
      id: "s",
      title: "Améliorer les exports",
      body: "CSV",
      kind: "pr",
      external_id: "42",
      source_label: "PULS",
      extra: { version: "v2.4" },
    },
  ],
  sources: [
    {
      id: "source",
      label: "GitHub PULS",
      provider: "github",
      scope: "org/puls",
      token: "do-not-index",
    },
  ],
  publications: [
    {
      id: "p",
      title: "Version 2.4",
      body: "Nouveau tableau de bord",
      state: "published",
    },
    { id: "draft", title: "Brouillon", state: "draft" },
    { id: "old", title: "Ancienne publication", state: "archived" },
  ],
  suggestions: [
    {
      id: "idea",
      title: "Export Excel",
      description: "Comptabilité",
      archived: 1,
    },
  ],
};
test("search matches accents, words across fields and content with title precedence", () => {
  assert.ok(
    includesSearch(
      "  eCHANGE   FACTURATION ",
      "Échange avec Marie",
      "Facturation",
    ),
  );
  assert.ok(
    matchSearchContent("multilingue", "Éditeur", "Publication multilingue"),
  );
  assert.ok(
    matchSearchContent("éditeur", "Éditeur").score >
      matchSearchContent("éditeur", "Autre", "Éditeur").score,
  );
  assert.equal(
    matchSearchContent("introuvable", "Éditeur", "Publication"),
    null,
  );
});
test("search covers private entity types and document text, retaining destinations and archives", () => {
  const records = buildSearchRecords(fixture);
  assert.equal(new Set(records.map((r) => r.kind)).size, 8);
  const attachment = records.find((r) => r.id === "a");
  assert.equal(attachment.targetId, "n");
  assert.equal(attachment.archived, true);
  assert.ok(
    matchSearchContent("prevision 2027", attachment.title, attachment.body),
  );
  assert.ok(
    matchSearchContent(
      "#42 v2.4",
      "PR",
      records.find((r) => r.id === "s").body,
    ),
  );
  assert.ok(
    matchSearchContent(
      "marches",
      "Commerce",
      records.find((r) => r.id === "t").body,
    ),
  );
  assert.equal(
    records.some((r) => r.id === "orphan"),
    false,
  );
  assert.equal(JSON.stringify(records).includes("do-not-index"), false);
});
test("public search excludes internal items, archives, drafts and every private content type", () => {
  assert.deepEqual(
    buildSearchRecords(fixture, true).map((r) => r.id),
    ["i", "p"],
  );
  assert.equal(
    buildSearchRecords(
      {
        publications: [
          { id: "public", title: "Public", published: "2026-10-02" },
        ],
      },
      true,
    ).length,
    1,
  );
});
