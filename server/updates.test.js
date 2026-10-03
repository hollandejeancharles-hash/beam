import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, createUpdates } from "./updates.js";
test("Version comparison sorts stable releases and numerical beta revisions", () => {
  assert.equal(compareVersions("v2.0.0-beta.10", "2.0.0-beta.2"), 1);
  assert.equal(compareVersions("2.0.0", "2.0.0-beta.99"), 1);
  assert.equal(compareVersions("junk", "2.0.0"), null);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
});
test("Update check excludes drafts and releases without a Mac package and caches checks", async () => {
  let calls = 0;
  const check = createUpdates(async () => {
    calls++;
    return {
      ok: true,
      json: async () => [
        {
          tag_name: "v9.0.0",
          draft: true,
          assets: [{ name: "Beam-AppleSilicon.dmg" }],
        },
        { tag_name: "v8.0.0", assets: [] },
        { tag_name: "v3.0.0", assets: [{ name: "Beam-AppleSilicon.dmg" }] },
      ],
    };
  });
  const r = await check();
  assert.equal(r.latest, "v3.0.0");
  assert.equal(r.available, true);
  assert.match(
    r.url,
    /github.com\/hollandejeancharles-hash\/beam\/releases\/tag\/v3.0.0$/,
  );
  await check();
  assert.equal(calls, 1);
  await check(true);
  assert.equal(calls, 2);
});
