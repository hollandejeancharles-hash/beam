import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import {
  sourceConfig,
  collectSource,
  createIntegrations,
} from "./integrations.js";
const response = (value) =>
  new Response(JSON.stringify(value), { status: 200 });
const gh = {
  provider: "github",
  url: "https://github.com/team/product",
  scope: "team/product",
};
const item = {
  title: "Roadmap choice",
  description: "Kept by owner",
  category: "Éditeur",
  priority: "high",
  status: "progress",
  visibility: "public",
  quarter: "T4 2026",
  start_date: "2026-10-01",
  end_date: "2026-11-01",
};
const githubFixture = async (url) =>
  response(
    url.includes("/issues?")
      ? [
          {
            number: 1,
            title: "Source ticket",
            html_url: "https://github.com/team/product/issues/1",
            state: "open",
            body: "External context",
            updated_at: "2026-10-02",
          },
        ]
      : url.includes("/actions/runs")
        ? {
            workflow_runs: [
              {
                id: 5,
                display_title: "CI",
                name: "Build",
                html_url: "https://github.com/team/product/actions/runs/5",
                conclusion: "failure",
                updated_at: "2026-10-02",
              },
            ],
            total_count: 1,
          }
        : [],
  );
test("source scopes only accept supported HTTPS providers and discard URL queries", () => {
  for (const url of [
    "http://github.com/a/b",
    "https://github.com.evil.test/a/b",
    "https://user:secret@github.com/a/b",
    "https://127.0.0.1/a/b",
    "https://github.com/a/b/issues",
  ])
    assert.throws(() => sourceConfig({ provider: "github", url }));
  assert.throws(() =>
    sourceConfig({
      provider: "confluence",
      url: "https://example.com/wiki",
      scope: "1",
    }),
  );
  assert.throws(() =>
    sourceConfig({ provider: "ado", url: "https://dev.azure.com/org" }),
  );
  assert.equal(sourceConfig({ ...gh }).scope, "team/product");
  const n = sourceConfig({
    provider: "notion",
    url: "https://www.notion.so/Test-0123456789abcdef0123456789abcdef?secret=no",
  });
  assert.ok(!n.url.includes("?"));
});
test("sync deduplicates source data, preserves roadmap edits and links; promotion stays internal", async () => {
  const store = createStore(":memory:"),
    service = createIntegrations(store, { env: {}, fetcher: githubFixture });
  const source = service.save(gh).id;
  const id = store.save(item);
  await service.sync(source);
  assert.equal(service.signals().length, 2);
  const signal = service.signals().find((s) => s.kind === "ticket");
  service.link(signal.id, id);
  await service.sync(source);
  assert.equal(service.signals().length, 2);
  assert.deepEqual(service.signals().find((s) => s.id === signal.id).links, [
    id,
  ]);
  assert.equal(store.list()[0].description, item.description);
  assert.equal(store.list()[0].start_date, item.start_date);
  assert.equal(service.promote(signal.id).id, id);
  const build = service.signals().find((s) => s.kind === "build");
  const promoted = service.promote(build.id).id;
  assert.equal(
    store.list().find((i) => i.id === promoted).visibility,
    "private",
  );
  assert.equal(service.promote(build.id).id, promoted);
  assert.equal(store.list(true).length, 1);
  service.link(signal.id, id, true);
  assert.equal(
    service.signals().find((s) => s.id === signal.id).links.length,
    0,
  );
  assert.equal(service.runs().length, 2);
  service.enable(source, false);
  await assert.rejects(service.sync(source), /pause/);
  service.enable(source, true);
  store.db.close();
});
test("failed reads preserve previous imported records and never expose provider credentials", async () => {
  const store = createStore(":memory:");
  let fail = false;
  const secret = "secret-source-credential";
  const service = createIntegrations(store, {
    env: { BEAM_GITHUB_TOKEN: secret },
    fetcher: async (url, opts) => {
      assert.equal(opts.headers.Authorization, "Bearer " + secret);
      assert.equal(opts.redirect, "error");
      if (fail) throw Error(secret);
      return githubFixture(url);
    },
  });
  const id = service.save(gh).id;
  await service.sync(id);
  fail = true;
  await assert.rejects(service.sync(id), /lecture a échoué/);
  assert.equal(service.signals().length, 2);
  assert.ok(!JSON.stringify(service.list()).includes(secret));
  assert.ok(!JSON.stringify(service.runs()).includes(secret));
  store.db.close();
});
test("Notion stays scoped to configured page and reads its excerpt", async () => {
  const calls = [];
  const result = await collectSource(
    { provider: "notion", scope: "page", url: "https://notion.so/page" },
    {
      env: { BEAM_NOTION_TOKEN: "test" },
      fetcher: async (url, opts) => {
        calls.push(url);
        assert.equal(opts.headers["Notion-Version"], "2025-09-03");
        return response(
          url.includes("/pages/")
            ? {
                id: "page",
                url: "https://notion.so/page",
                properties: {
                  title: { type: "title", title: [{ plain_text: "Spec" }] },
                },
                last_edited_time: "2026-10-02",
              }
            : {
                results: [
                  {
                    type: "paragraph",
                    paragraph: {
                      rich_text: [{ plain_text: "Acceptance criteria" }],
                    },
                  },
                ],
                has_more: false,
              },
        );
      },
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(result.records[0].body, "Acceptance criteria");
  assert.equal(result.records[0].kind, "document");
});
test("ADO normalizes work items, PRs and pipeline execution metadata", async () => {
  const result = await collectSource(
    {
      provider: "ado",
      url: "https://dev.azure.com/team/Product",
      scope: "team/Product",
    },
    {
      env: { BEAM_ADO_TOKEN: "test" },
      fetcher: async (url, opts) => {
        assert.ok(opts.headers.Authorization.startsWith("Basic "));
        if (url.includes("/wiql?"))
          return response({ workItems: [{ id: 42 }] });
        if (url.includes("workitemsbatch"))
          return response({
            value: [
              {
                id: 42,
                fields: {
                  "System.Title": "Epic",
                  "System.State": "Active",
                  "System.WorkItemType": "Epic",
                  "System.Description": "<p>Context</p>",
                },
              },
            ],
          });
        if (url.includes("/git/"))
          return response({
            value: [
              {
                pullRequestId: 7,
                title: "Change",
                repository: { name: "Product" },
                status: "active",
              },
            ],
          });
        return response({
          value: [
            {
              id: 9,
              buildNumber: "v2",
              definition: { name: "Release" },
              _links: {
                web: {
                  href: "https://dev.azure.com/team/Product/_build/results?buildId=9",
                },
              },
              result: "succeeded",
            },
          ],
        });
      },
    },
  );
  assert.deepEqual(
    result.records.map((r) => r.kind),
    ["ticket", "pr", "build"],
  );
  assert.equal(result.records[0].body, "Context");
  assert.equal(result.records[0].work_type, "Epic");
});
test("Confluence paginates within the validated space and imports page versions", async () => {
  let count = 0;
  const result = await collectSource(
    {
      provider: "confluence",
      url: "https://team.atlassian.net/wiki",
      scope: "123",
    },
    {
      env: {
        BEAM_CONFLUENCE_TOKEN: "test",
        BEAM_CONFLUENCE_EMAIL: "test@example.com",
      },
      fetcher: async (url) => {
        assert.ok(
          url.startsWith(
            "https://team.atlassian.net/wiki/api/v2/spaces/123/pages?",
          ),
        );
        count++;
        return response({
          results: [
            {
              id: count,
              title: "Doc " + count,
              status: "current",
              body: { storage: { value: "<p>Spec</p>" } },
              version: { number: 2 },
            },
          ],
          _links:
            count === 1
              ? { next: "/wiki/api/v2/spaces/123/pages?cursor=abc" }
              : {},
        });
      },
    },
  );
  assert.equal(count, 2);
  assert.equal(result.records[0].version, 2);
  assert.equal(result.records[0].body, "Spec");
});
