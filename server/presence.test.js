import test from "node:test";
import assert from "node:assert/strict";
import {
  activityPhrase,
  safeActivity,
  recentActivity,
} from "../shared/presence.js";
test("presence only exposes allowed screen activities, never supplied content", () => {
  assert.equal(safeActivity("Confidential roadmap title"), "browsing");
  assert.equal(
    activityPhrase("JC", "notes"),
    "JC raconte sa vie dans ses notes",
  );
  assert.equal(activityPhrase("JC", "secret"), "JC se promène dans Beam");
});
test("presence prefers a recent active window and expires stale activities", () => {
  const now = 100000;
  assert.equal(
    recentActivity(
      [
        { activity: "notes", updatedAt: 90000 },
        { activity: "idle", updatedAt: 99000 },
      ],
      now,
    ),
    "notes",
  );
  assert.equal(
    recentActivity([{ activity: "notes", updatedAt: 50000 }], now),
    "idle",
  );
  assert.equal(
    recentActivity(
      [
        { activity: "secret", updatedAt: 99000 },
        { activity: "notes", updatedAt: 200000 },
      ],
      now,
    ),
    "idle",
  );
});
test("background window heartbeat does not override a more recently used window", () => {
  assert.equal(
    recentActivity(
      [
        { activity: "gantt", updatedAt: 99000, interactedAt: 60000 },
        { activity: "notes", updatedAt: 95000, interactedAt: 90000 },
      ],
      100000,
    ),
    "notes",
  );
});
