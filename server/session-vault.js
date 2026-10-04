import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const memory = new WeakMap();
const vaults = new WeakMap();
export function createSessionVault(
  store,
  {
    helper = process.env.BEAM_KEYCHAIN_HELPER,
    platform = process.platform,
    run = spawnSync,
  } = {},
) {
  if (store.path === ":memory:") {
    return {
      read: () => memory.get(store) || null,
      write: (value) => memory.set(store, value),
      remove: () => memory.delete(store),
    };
  }
  const account = createHash("sha256")
    .update(resolve(store.path))
    .digest("hex");
  let cached,
    loaded = false,
    revision = 0;
  function call(operation, value) {
    if (platform !== "darwin" || !helper)
      throw Error(
        "Le stockage sécurisé des connexions est indisponible. Ouvrez Beam depuis l’application Mac.",
      );
    const result = run(helper, [], {
      input: JSON.stringify({ operation, account, value }),
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 262144,
    });
    if (result.status !== 0)
      throw Error(
        "Impossible d’accéder au Trousseau macOS. La connexion n’a pas été enregistrée.",
      );
    return JSON.parse(result.stdout);
  }
  return {
    get revision() {
      return revision;
    },
    read() {
      if (!loaded) {
        cached = helper ? call("read") : null;
        loaded = true;
      }
      return cached;
    },
    write(value) {
      call("write", value);
      cached = value;
      loaded = true;
      revision++;
    },
    remove() {
      call("delete");
      cached = null;
      loaded = true;
      revision++;
    },
  };
}
export function sessionStorage(store, vault) {
  if (!vault) {
    if (!vaults.has(store)) vaults.set(store, createSessionVault(store));
    vault = vaults.get(store);
  }
  return {
    version: () => vault.revision || 0,
    get() {
      const legacy = store.db
        .prepare("SELECT value FROM metadata WHERE key='beam_shared_session'")
        .get();
      if (legacy && legacy.value !== "null") {
        const session = JSON.parse(legacy.value);
        vault.write(session); // Delete only after the Keychain confirms persistence.
        store.db.exec("PRAGMA secure_delete=ON");
        store.db
          .prepare("DELETE FROM metadata WHERE key='beam_shared_session'")
          .run();
        store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        return session;
      }
      return vault.read();
    },
    put(value) {
      if (value) vault.write(value);
      else vault.remove();
      store.db
        .prepare("DELETE FROM metadata WHERE key='beam_shared_session'")
        .run();
    },
  };
}
