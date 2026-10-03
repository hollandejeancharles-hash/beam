import { safeActivity, recentActivity } from "../shared/presence.js";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createStore } from "./store.js";
const fields = [
  "id",
  "title",
  "description",
  "category",
  "priority",
  "status",
  "visibility",
  "quarter",
  "created",
  "position",
  "kanban_position",
  "archived",
  "type",
  "parent_id",
  "start_date",
  "end_date",
  "progress",
  "owner",
  "dependency_id",
];
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length > 3000)
    throw Error("Roadmap invalide");
  return items.map((i) =>
    Object.fromEntries(fields.map((k) => [k, i[k] ?? null])),
  );
}
export function replaceItems(store, rows) {
  const items = cleanItems(rows),
    placeholders = fields.map(() => "?").join(",");
  store.db.exec("BEGIN IMMEDIATE");
  try {
    store.db.exec("DELETE FROM items");
    const insert = store.db.prepare(
      `INSERT INTO items(${fields.join(",")}) VALUES(${placeholders})`,
    );
    for (const i of items) insert.run(...fields.map((k) => i[k]));
    store.db.exec("COMMIT");
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
export function createCollaboration(
  store,
  clientFactory = createClient,
  accountStore = store,
) {
  const get = (k) => {
    try {
      return JSON.parse(
        (k === "beam_shared_session" || k === "beam_shared_config"
          ? accountStore
          : store
        ).db
          .prepare("SELECT value FROM metadata WHERE key=?")
          .get(k)?.value || "null",
      );
    } catch {
      return null;
    }
  };
  const put = (k, v) =>
    (k === "beam_shared_session" || k === "beam_shared_config"
      ? accountStore
      : store
    ).db
      .prepare("INSERT OR REPLACE INTO metadata VALUES(?,?)")
      .run(k, JSON.stringify(v));
  let defaults;
  try {
    defaults = JSON.parse(
      readFileSync(
        new URL("../shared/deployment.json", import.meta.url),
        "utf8",
      ),
    );
  } catch {}
  let config = get("beam_shared_config") || defaults,
    session = get("beam_shared_session"),
    workspace = get("beam_shared_workspace");
  let client,
    presence = [],
    presenceActivity = {},
    channel,
    revision = null,
    connected = false,
    lastError = "",
    queue = Promise.resolve();
  const activityClients = new Map();
  async function reportActivity(b) {
    if (!workspace || !session || !channel) return state();
    if (
      typeof b.clientId !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(b.clientId)
    )
      throw Error("Présence invalide.");
    const now = Date.now();
    for (const [id, value] of activityClients)
      if (now - value.updatedAt >= 45000) activityClients.delete(id);
    activityClients.set(b.clientId, {
      activity: safeActivity(b.activity),
      interactedAt: Number.isFinite(b.interactedAt)
        ? Math.min(now, b.interactedAt)
        : now,
      updatedAt: now,
    });
    const current = [...activityClients.values()].sort(
      (a, b) =>
        (a.activity === "idle") - (b.activity === "idle") ||
        b.interactedAt - a.interactedAt,
    )[0];
    await channel.track?.({
      online: true,
      interactedAt: current?.interactedAt || now,
      activity: recentActivity([...activityClients.values()], now),
      updatedAt: now,
    });
    emit();
    return state();
  }
  const listeners = new Set();
  let changeVersion = 0;
  const emit = () => {
    changeVersion++;
    listeners.forEach((f) => f());
  };
  const exclusive = (f) => {
    const next = queue.then(f);
    queue = next.catch(() => {});
    return next;
  };
  const check = (r) => {
    if (r.error) throw Error(r.error.message);
    return r.data;
  };
  function init() {
    if (!config) return;
    client = clientFactory(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    client.auth.onAuthStateChange((event, s) => {
      if (event === "INITIAL_SESSION" && !s) return;
      session = s;
      put("beam_shared_session", s);
    });
  }
  init();
  async function authenticate() {
    session = get("beam_shared_session");
    if (!client || !session)
      throw Error("Connectez-vous à votre espace partagé.");
    if (!client.auth.getSession) return;
    const current = check(await client.auth.getSession());
    if (
      !current.session ||
      current.session.access_token !== session.access_token
    )
      check(await client.auth.setSession(session));
  }
  async function syncIdentity() {
    if (!workspace) return;
    const identity = JSON.parse(
      accountStore.db
        .prepare("SELECT value FROM metadata WHERE key='user_profile'")
        .get()?.value || "null",
    );
    const fingerprint =
      identity &&
      JSON.stringify({ name: identity.name, photo: identity.photo || null });
    if (identity?.name && get("beam_team_identity") !== fingerprint) {
      check(
        await client.rpc("beam_team_profile", {
          p_workspace: workspace.id,
          p_name: identity.name,
          p_photo: identity.photo || null,
        }),
      );
      put("beam_team_identity", fingerprint);
    }
  }
  async function pull() {
    try {
      await authenticate();
      await syncIdentity().catch(() => {});
      const row = check(
        await client
          .from("beam_roadmaps")
          .select("*")
          .eq("workspace_id", workspace.id)
          .single(),
      );
      // Cache for the local AI; notes and attachments never leave this database.
      const changed = revision !== row.revision || !connected;
      replaceItems(store, row.items);
      revision = row.revision;
      connected = true;
      lastError = "";
      if (changed) emit();
      return row;
    } catch (e) {
      const changed = connected || lastError !== e.message;
      connected = false;
      lastError = e.message;
      if (changed) emit();
      throw e;
    }
  }
  async function subscribe() {
    presence = [];
    if (client.realtime?.setAuth)
      await client.realtime.setAuth(session.access_token);
    if (channel) await client.removeChannel(channel);
    channel = client
      .channel("beam:" + workspace.id, {
        config: { private: true, presence: { key: session.user.id } },
      })
      .on("presence", { event: "sync" }, () => {
        const peers = channel.presenceState?.() || {};
        presence = Object.keys(peers);
        presenceActivity = Object.fromEntries(
          Object.entries(peers).map(([id, entries]) => [
            id,
            recentActivity(entries),
          ]),
        );
        emit();
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "beam_comments",
          filter: "workspace_id=eq." + workspace.id,
        },
        emit,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "beam_profiles",
          filter: "workspace_id=eq." + workspace.id,
        },
        emit,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "beam_activity",
          filter: "workspace_id=eq." + workspace.id,
        },
        emit,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "beam_roadmaps",
          filter: "workspace_id=eq." + workspace.id,
        },
        () => {
          void exclusive(pull).catch(() => {});
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          void channel.track?.({
            online: true,
            activity: "browsing",
            updatedAt: Date.now(),
          });
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          connected = false;
          lastError = "Connexion interrompue. Reconnexion en cours.";
          emit();
        }
      });
  }
  function state() {
    session = get("beam_shared_session");
    return {
      configured: !!config,
      presence,
      presenceActivity: {
        ...presenceActivity,
        ...(session?.user?.id && activityClients.size
          ? { [session.user.id]: recentActivity([...activityClients.values()]) }
          : {}),
      },
      changeVersion,
      userId: session?.user?.id || null,
      signedIn: !!session,
      email: session?.user?.email || "",
      workspace: workspace ? { ...workspace, revision } : null,
      connected: connected && !!session,
      error: lastError,
    };
  }
  async function settings(action, b = {}) {
    if (action === "presence") return reportActivity(b);
    return exclusive(async () => {
      if (action === "configure") {
        const u = new URL(b.url);
        if (
          u.protocol !== "https:" ||
          !u.hostname.endsWith(".supabase.co") ||
          u.pathname !== "/" ||
          u.search ||
          u.username ||
          u.password
        )
          throw Error("Utilisez l’URL HTTPS de votre projet Supabase.");
        if (
          typeof b.key !== "string" ||
          b.key.length < 20 ||
          b.key.startsWith("sb_secret_")
        )
          throw Error("Utilisez uniquement la clé publique publishable.");
        if (b.key.startsWith("eyJ")) {
          try {
            if (
              JSON.parse(Buffer.from(b.key.split(".")[1], "base64url")).role !==
              "anon"
            )
              throw Error();
          } catch {
            throw Error(
              "La clé doit être publique (anon), jamais service_role.",
            );
          }
        }
        if (workspace) throw Error("Quittez d’abord l’espace partagé.");
        config = { url: u.origin, key: b.key };
        put("beam_shared_config", config);
        init();
        return state();
      }
      if (!client) throw Error("Configurez votre projet Supabase.");
      if (action === "signup" || action === "login") {
        if (
          typeof b.email !== "string" ||
          b.email.length > 180 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ||
          typeof b.password !== "string" ||
          b.password.length < 8 ||
          b.password.length > 128
        )
          throw Error("E-mail et mot de passe (8 caractères minimum) requis.");
        const result = check(
          await client.auth[
            action === "signup" ? "signUp" : "signInWithPassword"
          ]({ email: b.email.trim(), password: b.password }),
        );
        session = result.session;
        put("beam_shared_session", session);
        return { ...state(), confirmationRequired: !session };
      }
      await authenticate();
      if (action === "team-profile") {
        if (!workspace) throw Error("Ouvrez un espace partagé.");
        check(
          await client.rpc("beam_team_profile", {
            p_workspace: workspace.id,
            p_name: b.name,
            p_photo: b.photo || null,
          }),
        );
        put(
          "beam_team_identity",
          JSON.stringify({ name: b.name, photo: b.photo || null }),
        );
        emit();
        return state();
      }
      if (action === "comment") {
        if (!workspace) throw Error("Ouvrez un espace partagé.");
        if (
          typeof b.body !== "string" ||
          !b.body.trim() ||
          b.body.length > 4000
        )
          throw Error("Écrivez un commentaire de 1 à 4 000 caractères.");
        check(
          await client.rpc("beam_comment", {
            p_workspace: workspace.id,
            p_item: b.itemId,
            p_body: b.body,
          }),
        );
        emit();
        return state();
      }
      if (action === "list")
        return check(await client.from("beam_workspaces").select("id,name"));
      if (action === "create" || action === "join" || action === "select") {
        if (workspace)
          throw Error("Quittez l’espace actuel avant d’en ouvrir un autre.");
        let id = b.id;
        if (action === "create")
          id = check(
            await client.rpc("beam_create_workspace", {
              p_name: b.name,
              p_items: b.shareExisting === true ? cleanItems(store.list()) : [],
            }),
          );
        if (action === "join")
          id = check(await client.rpc("beam_join", { p_code: b.code }));
        const w = check(
          await client
            .from("beam_workspaces")
            .select("id,name")
            .eq("id", id)
            .single(),
        );
        const member = check(
          await client
            .from("beam_members")
            .select("role")
            .eq("workspace_id", id)
            .eq("user_id", session.user.id)
            .single(),
        );
        const roadmap = check(
          await client
            .from("beam_roadmaps")
            .select("*")
            .eq("workspace_id", id)
            .single(),
        );
        put("beam_local_items_backup", cleanItems(store.list()));
        workspace = { ...w, role: member.role };
        put("beam_shared_workspace", workspace);
        replaceItems(store, roadmap.items);
        revision = roadmap.revision;
        connected = true;
        lastError = "";
        await subscribe();
        emit();
        return state();
      }
      if (action === "invite")
        return {
          code: check(
            await client.rpc("beam_invite", {
              p_workspace: workspace?.id,
              p_role: b.role || "editor",
            }),
          ),
        };
      if (action === "disconnect") {
        if (channel) await client.removeChannel(channel);
        const backup = get("beam_local_items_backup");
        // Keep the current roadmap when collaboration is disabled.
        workspace = null;
        presence = [];
        put("beam_shared_workspace", null);
        put("beam_local_items_backup", null);
        connected = false;
        revision = null;
        emit();
        return state();
      }
      if (action === "logout") {
        if (channel) await client.removeChannel(channel);
        presence = [];
        connected = false;
        check(await client.auth.signOut());
        session = null;
        put("beam_shared_session", null);
        return state();
      }
      throw Error("Action inconnue");
    });
  }
  async function items(method, path, b = {}) {
    return exclusive(async () => {
      if (!workspace) return null;
      if (method === "GET") {
        try {
          await pull();
        } catch {
          /* Keep the last local cache readable offline. */
        }
        return {
          status: 200,
          data: store.list().map((i) => ({ ...i, _revision: revision })),
        };
      }
      if (workspace.role === "viewer")
        return {
          status: 403,
          data: { error: "Cet espace est en lecture seule." },
        };
      await authenticate();
      // Apply against the revision actually seen by this Mac, never a fresh unseen
      // snapshot. The database RPC atomically rejects stale writes.
      if (!connected || revision === null)
        return {
          status: 503,
          data: {
            error: "Reconnectez-vous avant de modifier la roadmap partagée.",
          },
        };
      if (b._revision !== revision)
        return {
          status: 409,
          data: {
            error:
              "La roadmap a changé depuis votre dernière lecture. Actualisez puis réessayez.",
          },
        };
      const copy = createStore(":memory:");
      try {
        replaceItems(copy, store.list());
        let data = { ok: true },
          status = 200;
        if (path.endsWith("/kanban")) copy.reorderKanban(b.columns);
        else if (path.endsWith("/reorder"))
          copy.reorder(b.id, b.target_id, b.after);
        else if (path.endsWith("/archive"))
          copy.archive(path.split("/").at(-2), b.archived);
        else if (method === "POST") {
          data = { id: copy.save(b) };
          status = 201;
        } else if (method === "PATCH")
          data = { id: copy.save(b, path.split("/").at(-1)) };
        else if (method === "DELETE") copy.remove(path.split("/").at(-1));
        else throw Error("Action invalide");
        const rows = cleanItems(copy.list());
        const result = await client.rpc("beam_save_roadmap", {
          p_workspace: workspace.id,
          p_revision: revision,
          p_items: rows,
        });
        if (result.error) {
          if (result.error.message.includes("BEAM_CONFLICT")) {
            await pull();
            return {
              status: 409,
              data: {
                error:
                  "Un collègue a modifié la roadmap. La vue a été actualisée ; vérifiez puis réessayez.",
              },
            };
          }
          throw Error(result.error.message);
        }
        replaceItems(store, rows);
        revision = result.data;
        lastError = "";
        emit();
        return { status, data };
      } finally {
        copy.db.close();
      }
    });
  }
  // Reconnect without requiring a new login; Realtime + occasional recovery pull.
  const ready = workspace
    ? exclusive(async () => {
        await authenticate();
        await pull();
        await subscribe();
      }).catch(() => {})
    : Promise.resolve();
  const timer = setInterval(() => {
    if (workspace) void exclusive(pull).catch(() => {});
  }, 30000);
  timer.unref();
  return {
    state,
    settings,
    items,
    ready,
    async team(itemId) {
      if (!workspace) return { profiles: [], comments: [], activity: [] };
      await authenticate();
      await syncIdentity();
      const profiles = check(
        await client
          .from("beam_profiles")
          .select("user_id,name,photo")
          .eq("workspace_id", workspace.id),
      );
      let comments = [],
        activity = [];
      if (itemId) {
        comments = check(
          await client
            .from("beam_comments")
            .select("id,user_id,body,created_at")
            .eq("workspace_id", workspace.id)
            .eq("item_id", itemId)
            .order("created_at", { ascending: false })
            .limit(100),
        );
        activity = check(
          await client
            .from("beam_activity")
            .select("id,user_id,action,changes,created_at")
            .eq("workspace_id", workspace.id)
            .eq("item_id", itemId)
            .order("created_at", { ascending: false })
            .limit(100),
        );
      }
      return { profiles, comments, activity };
    },
    active: () => !!workspace,
    onChange: (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    close: async () => {
      clearInterval(timer);
      if (channel) await client.removeChannel(channel);
      client?.auth.stopAutoRefresh();
    },
  };
}
