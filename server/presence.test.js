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


test('item presence selects the active window and drops stale or invalid context', async()=>{
 const {recentItemContext,safeItemContext}=await import('../shared/presence.js');
 assert.equal(safeItemContext('private text with spaces'),null);
 assert.deepEqual(recentItemContext([{activity:'gantt',updatedAt:99000,interactedAt:98000,itemId:'feature-1',editing:true},{activity:'notes',updatedAt:100000,interactedAt:99000}],100000),{itemId:null,editing:false});
 assert.deepEqual(recentItemContext([{activity:'gantt',updatedAt:99000,itemId:'feature-1',editing:true}],100000),{itemId:'feature-1',editing:true});
 assert.deepEqual(recentItemContext([{activity:'gantt',updatedAt:1000,itemId:'feature-1',editing:true}],100000),{itemId:null,editing:false});
});
