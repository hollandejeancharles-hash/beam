import test from "node:test";
import assert from "node:assert/strict";
import { notificationRows, createNotifications } from "./notifications.js";
import { createStore } from "./store.js";
const base = {
  userId: "me",
  since: "2026-10-03T12:00:00Z",
  items: [{ id: "i", title: "Une feature" }],
  team: {
    profiles: [
      { user_id: "me", name: "JC" },
      { user_id: "other", name: "Marie" },
    ],
  },
  now: "2026-10-03T14:00:00Z",
};
test("Notifications exclude self, old history and cosmetic changes; comments never expose body", () => {
  const rows = notificationRows({
    ...base,
    team: {
      ...base.team,
      comments: [
        {
          id: "1",
          item_id: "i",
          user_id: "other",
          body: "@JC secret business",
          created_at: "2026-10-03T13:00:00Z",
        },
        {
          id: "2",
          item_id: "i",
          user_id: "me",
          created_at: "2026-10-03T13:00:00Z",
        },
        {
          id: "3",
          item_id: "i",
          user_id: "other",
          created_at: "2026-10-02T13:00:00Z",
        },
      ],
      activity: [
        {
          id: "4",
          item_id: "i",
          user_id: "other",
          action: "updated",
          changes: { position: { after: 1 } },
          created_at: "2026-10-03T13:00:00Z",
        },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Marie vous a mentionné");
  assert.ok(!JSON.stringify(rows).includes("secret business"));
  assert.deepEqual(rows[0].target, { kind: "item", id: "i" });
});
test("Repeated significant changes and AI proposals are grouped; resolved alerts disappear", () => {
  const rows = notificationRows({
    ...base,
    inbox: [{ id: "p1" }, { id: "p2" }],
    team: {
      activity: [
        {
          id: "a",
          item_id: "i",
          user_id: "other",
          action: "updated",
          changes: { status: {} },
          created_at: "2026-10-03T13:00:00Z",
        },
        {
          id: "b",
          item_id: "i",
          user_id: "other",
          action: "updated",
          changes: { priority: {} },
          created_at: "2026-10-03T13:01:00Z",
        },
      ],
    },
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.id === "change:b"));
  assert.ok(rows.some((r) => r.kind === "ai" && r.title.startsWith("2")));
  assert.equal(notificationRows(base).length, 0);
  assert.equal(
    notificationRows({ ...base, inbox: [{ id: "p2" }, { id: "p1" }] })[0].id,
    rows.find((r) => r.kind === "ai").id,
  );
});
test("Read state persists and is isolated by account and workspace", () => {
  const a = createStore(":memory:"),
    b = createStore(":memory:");
  try {
    const n = createNotifications(a),
      m = createNotifications(b),
      rows = [{ id: "one" }];
    n.read("me", ["one"]);
    assert.equal(n.list("me", rows).notifications[0].read, true);
    assert.equal(
      createNotifications(a).list("me", rows).notifications[0].read,
      true,
    );
    assert.equal(n.list("other", rows).notifications[0].read, false);
    assert.equal(m.list("me", rows).notifications[0].read, false);
    assert.throws(() => n.read("me", [{}]));
  } finally {
    a.db.close();
    b.db.close();
  }
});

test("Reading AI proposals does not notify again when a proposal is resolved, but new proposals do", () => {
  const store = createStore(":memory:");
  try {
    const n = createNotifications(store);
    const first = notificationRows({
      ...base,
      inbox: [{ id: "a" }, { id: "b" }],
    });
    n.list("me", first);
    n.read("me", [first[0].id]);
    assert.equal(
      n.list("me", notificationRows({ ...base, inbox: [{ id: "b" }] }))
        .notifications[0].read,
      true,
    );
    assert.equal(
      n.list(
        "me",
        notificationRows({ ...base, inbox: [{ id: "b" }, { id: "c" }] }),
      ).notifications[0].read,
      false,
    );
  } finally {
    store.db.close();
  }
});
