import test from "node:test";
import assert from "node:assert/strict";
import { publicRoadmap } from "../scripts/public-roadmap.js";
test("Pages export excludes internal records and visitor-specific fields", () => {
  const exported = publicRoadmap([
    {
      id: "public",
      title: "Public",
      visibility: "public",
      voted: 1,
      votes: 12,
      secret: "hidden",
    },
    { id: "private", title: "Internal", visibility: "private" },
  ]);
  assert.equal(exported.length, 1);
  assert.equal(exported[0].id, "public");
  for (const field of ["voted", "votes", "secret"])
    assert.equal(field in exported[0], false);
});
