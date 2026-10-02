import test from "node:test";
import assert from "node:assert/strict";
import { githubReleaseLogs } from "./github-release.js";
const base = "b".repeat(40),
  head = "a".repeat(40),
  source = { scope: "team/product" },
  release = {
    id: "r",
    source_id: "repo",
    external_id: "42",
    extra: { version: "v2" },
  };
function fake(compare, seen = []) {
  return async (url, options) => {
    seen.push({ url, options });
    const body = url.includes("/releases/")
      ? { tag_name: "v2", draft: false, prerelease: false }
      : url.includes("/commits/v1")
        ? { sha: base }
        : url.includes("/commits/v2")
          ? { sha: head }
          : typeof compare === "function"
            ? compare(url)
            : compare;
    return new Response(JSON.stringify(body));
  };
}
const comparison = {
  status: "ahead",
  base_commit: { sha: base },
  merge_base_commit: { sha: base },
  total_commits: 1,
  commits: [{ sha: head, commit: { message: "Search contents" } }],
};
test("Version logs use resolved immutable tag bounds and contain exactly the comparison commits", async () => {
  const seen = [];
  const logs = await githubReleaseLogs(source, release, "v1", {
    fetcher: fake(comparison, seen),
    token: "test-token",
  });
  assert.equal(logs.version, "v2");
  assert.equal(logs.base_sha, base);
  assert.equal(logs.head_sha, head);
  assert.deepEqual(logs.commits, [{ sha: head, message: "Search contents" }]);
  assert.ok(
    seen.some((r) => r.url.includes("/compare/" + base + "..." + head)),
  );
  assert.ok(seen.every((r) => r.options.redirect === "error"));
});
test("Version logs reject missing bounds, divergent branches, incomplete comparisons and changed release tags", async () => {
  await assert.rejects(
    githubReleaseLogs(source, release, "", { fetcher: fake(comparison) }),
    /départ/,
  );
  await assert.rejects(
    githubReleaseLogs(source, release, "v1", {
      fetcher: fake({ ...comparison, status: "diverged" }),
    }),
    /ancêtre/,
  );
  await assert.rejects(
    githubReleaseLogs(source, release, "v1", {
      fetcher: fake({ ...comparison, total_commits: 2, commits: [] }),
    }),
    /incomplets/,
  );
  await assert.rejects(
    githubReleaseLogs(source, release, "v1", {
      fetcher: fake({ ...comparison, total_commits: 501 }),
    }),
    /500/,
  );
  await assert.rejects(
    githubReleaseLogs(source, { ...release, extra: { version: "old" } }, "v1", {
      fetcher: fake(comparison),
    }),
    /changé/,
  );
});
test("Version logs paginate without silently dropping historical commits", async () => {
  const commits = Array.from({ length: 101 }, (_, i) => ({
    sha: i.toString(16).padStart(40, "0"),
    commit: { message: "Change " + i },
  }));
  const logs = await githubReleaseLogs(source, release, "v1", {
    fetcher: fake((url) => ({
      ...comparison,
      total_commits: 101,
      commits: url.includes("page=2")
        ? commits.slice(100)
        : commits.slice(0, 100),
    })),
  });
  assert.equal(logs.commits.length, 101);
  assert.equal(logs.commits[100].message, "Change 100");
});

test("Version log import keeps stable source IDs for automatic product associations and rejects paused repositories", async () => {
  const { createStore } = await import("./store.js");
  const { createIntegrations } = await import("./integrations.js");
  const store = createStore(":memory:");
  try {
    const service = createIntegrations(store, {
      env: {},
      fetcher: fake(comparison),
    });
    const sourceId = service.save({
      provider: "github",
      url: "https://github.com/team/product",
    }).id;
    store.db
      .prepare("INSERT INTO signals VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        "r",
        sourceId,
        "42",
        "release",
        "v2",
        "https://github.com/team/product/releases/tag/v2",
        "published",
        "Release",
        "2026-10-02",
        JSON.stringify({ version: "v2" }),
      );
    const logs = await service.releaseLogs("r", "v1");
    assert.equal(logs.commits.length, 1);
    const commit = service.signals().find((s) => s.kind === "commit");
    assert.equal(commit.external_id, head);
    await service.releaseLogs("r", "v1");
    assert.equal(
      service.signals().find((s) => s.kind === "commit").id,
      commit.id,
    );
    service.enable(sourceId, false);
    await assert.rejects(service.releaseLogs("r", "v1"), /actif/);
  } finally {
    store.db.close();
  }
});
