import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createStore } from "./store.js";

export function createWorkspaces(root, databasePath) {
  const get = (key) => {
    try {
      return JSON.parse(
        root.db.prepare("SELECT value FROM metadata WHERE key=?").get(key)
          ?.value || "null",
      );
    } catch {
      return null;
    }
  };
  const put = (key, value) =>
    root.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)")
      .run(key, JSON.stringify(value));
  let ids = get("beam_local_workspaces") || ["default"];
  let active = get("beam_active_workspace") || "default";
  if (!ids.includes(active)) active = "default";
  const stores = new Map([["default", root]]),
    listeners = new Set();
  const folder = join(dirname(resolve(databasePath)), "workspaces");
  put("beam_local_workspaces", ids);
  function store(id) {
    if (!ids.includes(id))
      throw Object.assign(Error("Workspace introuvable"), { status: 404 });
    if (!stores.has(id)) {
      mkdirSync(folder, { recursive: true });
      stores.set(id, createStore(join(folder, id + ".sqlite")));
    }
    return stores.get(id);
  }
  const list = () => ({
    active,
    workspaces: ids.map((id) => {
      const db = store(id).db;
      const product = JSON.parse(
        db.prepare("SELECT value FROM metadata WHERE key='product'").get()
          ?.value || '{"name":"PULS"}',
      );
      return {
        id,
        name: product.name,
        description: product.description || "",
        image: product.image || null,
        shared: !!db
          .prepare(
            "SELECT value FROM metadata WHERE key='beam_shared_workspace' AND value != 'null'",
          )
          .get(),
      };
    }),
  });
  const emit = () => listeners.forEach((fn) => fn(list()));
  return {
    store,
    list,
    active: () => active,
    path: (id) =>
      id === "default" ? resolve(databasePath) : join(folder, id + ".sqlite"),
    select(id) {
      store(id);
      active = id;
      put("beam_active_workspace", active);
      emit();
      return list();
    },
    create(input) {
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 80
      )
        throw Error("Indiquez un nom de workspace (80 caractères maximum).");
      if (
        input.description != null &&
        (typeof input.description !== "string" ||
          input.description.length > 160)
      )
        throw Error("Description invalide");
      if (ids.length >= 40)
        throw Error("Vous pouvez créer jusqu’à 40 workspaces.");
      const id = randomUUID();
      mkdirSync(folder, { recursive: true });
      const next = createStore(join(folder, id + ".sqlite"));
      next.db
        .prepare("INSERT OR REPLACE INTO metadata VALUES('product',?)")
        .run(
          JSON.stringify({
            name: input.name.trim(),
            description: input.description?.trim() || "",
            image: null,
          }),
        );
      next.db
        .prepare(
          "INSERT OR REPLACE INTO metadata VALUES('beam_onboarding_complete','true')",
        )
        .run();
      const aiPreference = store(active)
        .db.prepare("SELECT value FROM metadata WHERE key='ai_enabled'")
        .get()?.value;
      if (aiPreference)
        next.db
          .prepare("INSERT OR REPLACE INTO metadata VALUES('ai_enabled',?)")
          .run(aiPreference);
      stores.set(id, next);
      ids = [...ids, id];
      put("beam_local_workspaces", ids);
      return this.select(id);
    },
    notify: emit,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
