import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import {
  createCollaboration,
  cleanItems,
  replaceItems,
} from "./collaboration.js";
const item = {
  title: "Feature",
  description: "Context",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "private",
  quarter: "T4 2026",
};
function fixture(role = "owner") {
  const store = createStore(":memory:");
  const id = store.save(item);
  const remote = { items: cleanItems(store.list()), revision: 0 };
  let session = { user: { id: "user", email: "team@example.test" } };
  const fake = {
    auth: {
      onAuthStateChange() {},
      getSession: async () => ({ data: { session } }),
      setSession: async () => ({ data: { session } }),
      signInWithPassword: async () => ({ data: { session } }),
      stopAutoRefresh() {},
    },
    from(table) {
      let filter;
      return {
        select() {
          return this;
        },
        eq(k, v) {
          filter = v;
          return this;
        },
        async single() {
          return {
            data:
              table === "beam_workspaces"
                ? { id: "w", name: "Team" }
                : table === "beam_members"
                  ? { role }
                  : { ...remote },
          };
        },
      };
    },
    rpc: async (name, b) => {
      if (name === "beam_save_roadmap") {
        if (b.p_revision !== remote.revision)
          return { error: { message: "BEAM_CONFLICT" } };
        remote.items = b.p_items;
        return { data: ++remote.revision };
      }
      return { data: "w" };
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      };
    },
    removeChannel: async () => {},
  };
  const c = createCollaboration(store, () => fake);
  return { store, id, remote, c };
}
async function connect(f) {
  await f.c.settings("login", {
    email: "team@example.test",
    password: "password123",
  });
  await f.c.settings("select", { id: "w" });
}
test("Only roadmap fields are shared, never arbitrary metadata or note content", () => {
  const s = createStore(":memory:");
  s.save(item);
  const rows = cleanItems(
    s
      .list()
      .map((i) => ({
        ...i,
        token: "secret",
        notes: "private note",
        _revision: 42,
      })),
  );
  assert.equal(rows[0].token, undefined);
  assert.equal(rows[0].notes, undefined);
  assert.equal(rows[0]._revision, undefined);
  s.db.close();
});
test("Remote revisions reject concurrent writes without losing either roadmap", async () => {
  const f = fixture();
  try {
    await connect(f);
    f.remote.revision = 1;
    f.remote.items[0].title = "Colleague";
    const r = await f.c.items("PATCH", "/api/admin/items/" + f.id, {
      title: "Mine",
      _revision: 0,
    });
    assert.equal(r.status, 409);
    assert.equal(f.store.list()[0].title, "Colleague");
    assert.equal(f.remote.items[0].title, "Colleague");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Reader cannot save, reorder or delete roadmap items", async () => {
  const f = fixture("viewer");
  try {
    await connect(f);
    for (const path of [
      "/api/admin/items/" + f.id,
      "/api/admin/items/reorder",
      "/api/admin/items/kanban",
    ])
      assert.equal(
        (await f.c.items("POST", path, { _revision: 0 })).status,
        403,
      );
    assert.equal(f.remote.revision, 0);
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Saving updates both shared revision and local AI cache; leaving restores local roadmap", async () => {
  const f = fixture();
  try {
    await connect(f);
    const r = await f.c.items("PATCH", "/api/admin/items/" + f.id, {
      title: "Shared edit",
      _revision: 0,
    });
    assert.equal(r.status, 200);
    assert.equal(f.remote.items[0].title, "Shared edit");
    assert.equal(f.c.state().workspace.revision, 1);
    await f.c.settings("disconnect");
    assert.equal(f.store.list()[0].title, "Feature");
    assert.equal(f.remote.items[0].title, "Shared edit");
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Old client revision is rejected even after realtime refresh", async () => {
  const f = fixture();
  try {
    await connect(f);
    f.remote.revision = 2;
    await f.c.items("GET", "/api/admin/items");
    assert.equal(
      (
        await f.c.items("PATCH", "/api/admin/items/" + f.id, {
          title: "stale",
          _revision: 0,
        })
      ).status,
      409,
    );
  } finally {
    await f.c.close();
    f.store.db.close();
  }
});
test("Failed snapshot import rolls back instead of emptying the local roadmap", () => {
  const f = fixture();
  assert.throws(() => replaceItems(f.store, [{ id: f.id }]));
  assert.equal(f.store.list()[0].title, "Feature");
  void f.c.close();
  f.store.db.close();
});
