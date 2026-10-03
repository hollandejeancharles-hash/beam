import { invitationCode } from "../shared/invitations.js";
import { publicRoadmap } from "../scripts/public-roadmap.js";
import { createWorkspaces } from "./workspaces.js";
import { inWorkspace } from "./ai-progress.js";
import { createBackups } from "./backups.js";
import { createUpdates } from "./updates.js";
import { createAISetup } from "./ai-setup.js";
import { createCollaboration } from "./collaboration.js";
import { createDecisions } from "./decisions.js";
import { buildInbox } from "../shared/inbox.js";
import { createSearch } from "./search.js";
import { createPublications, publicPublications } from "./publications.js";
import { activity } from "./ai-progress.js";
import { createAssociations } from "./associations.js";
import { createProfile } from "./profile.js";
import { createTopics } from "./topics.js";
import { createAttachments } from "./attachments.js";
import { startLocalAI } from "./ai-runtime.js";
import { createAI } from "./ai.js";
import { createNotes } from "./notes.js";
import http from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createIntegrations } from "./integrations.js";
import { createStore, seed } from "./store.js";
const prod = process.env.NODE_ENV === "production";
const desktop =
  process.env.BEAM_DESKTOP === "1" &&
  (!process.env.HOST || process.env.HOST === "127.0.0.1");
const assets = process.env.BEAM_ASSETS || "dist";
if (prod && !desktop && !process.env.BEAM_ADMIN_TOKEN)
  throw Error("BEAM_ADMIN_TOKEN est requis en production");
mkdirSync("data", { recursive: true });
const databasePath = process.env.BEAM_DB || "data/beam.sqlite";
const rootStore = createStore(databasePath);
const personalProfile = createProfile(rootStore);
const workspaces = createWorkspaces(rootStore, databasePath);
const contexts = new Map();
function inspectWorkspaceBackup(file) {
  if (
    file.version !== 1 ||
    !Array.isArray(file.workspaces) ||
    !file.workspaces.length ||
    file.workspaces.length + workspaces.list().workspaces.length > 40
  )
    throw Error(
      "Sauvegarde de workspaces invalide ou limite de 40 espaces dépassée.",
    );
  const counts = { items: 0, notes: 0, note_attachments: 0 };
  for (const entry of file.workspaces) {
    if (
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 80
    )
      throw Error("Nom de workspace invalide dans la sauvegarde.");
    const summary = createBackups(rootStore).inspect(entry.backup);
    for (const key of Object.keys(counts))
      counts[key] += summary.counts[key] || 0;
  }
  return {
    created: file.created,
    workspaceCount: file.workspaces.length,
    counts,
  };
}
const checkUpdates = createUpdates();
await startLocalAI();
function context(id) {
  if (!contexts.has(id))
    contexts.set(
      id,
      inWorkspace(id, () => {
        const store = workspaces.store(id);
        const collaboration = createCollaboration(store, undefined, rootStore);
        const localSave = store.save.bind(store);
        store.save = (...args) => {
          if (collaboration.active())
            throw Error(
              "Pour partager cette proposition, créez ou modifiez l’élément depuis la Planification. Les propositions IA peuvent aussi être validées depuis l’assistant local.",
            );
          return localSave(...args);
        };
        const profile = personalProfile;
        const integrations = createIntegrations(store);
        const notes = createNotes(store);
        const decisions = createDecisions(store);
        const attachments = createAttachments(store);
        const ai = createAI(store, notes, integrations);
        const aiSetup = createAISetup(fetch, () => ai.configure(true));
        const backups = createBackups(store, {
          directory: resolve(dirname(workspaces.path(id)), "backups", id),
          restoreProfile: false,
          active: () => collaboration.active(),
          busy: () =>
            ai.busy() ||
            associations.list().running ||
            topics.list().running ||
            applyingReviews.size > 0,
        });
        const applyingReviews = new Set();
        const publications = createPublications(store, ai, fetch, {
          notes,
          integrations,
          discover: () => associations.refresh({ force: true }),
        });
        const associations = createAssociations(store, notes, integrations, ai);
        ai.setDiscovery((id) =>
          associations.refresh({ force: true, itemId: id }),
        );
        ai.resume();
        const topics = createTopics(store, notes, integrations, ai);
        const searchIndex = createSearch({
          decisions,
          store,
          notes,
          topics,
          integrations,
          publications,
        });
        return {
          store,
          collaboration,
          profile,
          integrations,
          notes,
          decisions,
          attachments,
          ai,
          aiSetup,
          backups,
          applyingReviews,
          publications,
          associations,
          topics,
          searchIndex,
        };
      }),
    );
  return contexts.get(id);
}
context(workspaces.active());
const organizeSources = async () => {
  const id = workspaces.active();
  await inWorkspace(id, async () => {
    const { associations, topics, ai } = context(id);
    await associations.refresh();
    if (!ai.busy()) await topics.refresh();
  });
};
setTimeout(() => void organizeSources(), 5000).unref();
setInterval(() => void organizeSources(), 60000).unref();
if (process.env.BEAM_SEED === "true") seed(context(workspaces.active()).store);
const vite = prod
  ? null
  : await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" });
const token = process.env.BEAM_ADMIN_TOKEN;
const authorized = (req) =>
  (!token && (!prod || desktop)) ||
  (() => {
    const a = Buffer.from(
      req.headers.authorization?.replace(/^Bearer /, "") || "",
    );
    const b = Buffer.from(token || "");
    return a.length === b.length && timingSafeEqual(a, b);
  })();
const attempts = new Map();
function limited(key, max) {
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now - entry.start > 60000) {
    entry = { start: now, count: 0 };
    attempts.set(key, entry);
  }
  if (attempts.size > 10000)
    for (const [k, v] of attempts)
      if (now - v.start > 60000) attempts.delete(k);
  return ++entry.count > max;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) {
    if (vite) return vite.middlewares(req, res);
    const path = resolve(assets, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(resolve(assets) + "/") && path !== resolve(assets)) {
      res.writeHead(403);
      return res.end();
    }
    const file =
      existsSync(path) && extname(path) ? path : resolve(assets, "index.html");
    try {
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[extname(file)] || "application/octet-stream",
      );
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const send = (status, data) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  try {
    let visitor = req.headers.cookie?.match(
      /(?:^|; )beam_visitor=([a-f0-9-]{36})(?:;|$)/,
    )?.[1];
    if (!visitor) {
      visitor = randomUUID();
      res.setHeader(
        "Set-Cookie",
        `beam_visitor=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${prod && !desktop ? "; Secure" : ""}`,
      );
    }
    const admin = url.pathname.startsWith("/api/admin");
    if (
      req.method !== "GET" &&
      limited(req.socket.remoteAddress || "unknown", 60)
    )
      return send(429, {
        error: "Trop de requêtes. Réessayez dans une minute.",
      });
    if (admin && !authorized(req)) {
      if (limited("auth:" + req.socket.remoteAddress, 20))
        return send(429, {
          error: "Trop de tentatives. Réessayez dans une minute.",
        });
      return send(401, { error: "Clé d’accès incorrecte" });
    }
    const workspaceId =
      req.headers["x-beam-workspace"] ||
      url.searchParams.get("workspace") ||
      workspaces.active();
    const {
      store,
      collaboration,
      profile,
      integrations,
      notes,
      decisions,
      attachments,
      ai,
      aiSetup,
      backups,
      applyingReviews,
      publications,
      associations,
      topics,
      searchIndex,
    } = context(workspaceId);
    return await inWorkspace(workspaceId, async () => {
      if (url.pathname === "/api/admin/workspaces" && req.method === "GET")
        return send(200, workspaces.list());
      if (
        url.pathname === "/api/admin/workspaces/events" &&
        req.method === "GET"
      ) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        res.write("data: " + JSON.stringify(workspaces.list()) + "\n\n");
        const unsubscribe = workspaces.onChange((state) =>
          res.write("data: " + JSON.stringify(state) + "\n\n"),
        );
        const timer = setInterval(() => res.write(": heartbeat\n\n"), 20000);
        req.on("close", () => {
          clearInterval(timer);
          unsubscribe();
        });
        return;
      }
      if (url.pathname === "/api/admin/public-export" && req.method === "GET")
        return send(200, {
          format: "beam-publication",
          version: 1,
          product: integrations.product(),
          roadmap: publicRoadmap(store.list()),
          publications: publicPublications(publications.list()),
        });
      if (url.pathname === "/api/admin/backup/all" && req.method === "GET")
        return send(200, {
          format: "beam-workspaces-backup",
          version: 1,
          created: new Date().toISOString(),
          profile: personalProfile.get(),
          workspaces: workspaces.list().workspaces.map((w) => ({
            name: w.name,
            backup: createBackups(workspaces.store(w.id)).snapshot(),
          })),
        });
      if (url.pathname === "/api/admin/backup" && req.method === "GET")
        return send(200, backups.snapshot());
      if (url.pathname === "/api/admin/updates" && req.method === "GET")
        return send(
          200,
          await checkUpdates(url.searchParams.get("force") === "true"),
        );
      if (url.pathname === "/api/admin/team" && req.method === "GET")
        return send(
          200,
          await collaboration.team(url.searchParams.get("item")),
        );
      if (url.pathname === "/api/admin/onboarding" && req.method === "GET")
        return send(200, {
          complete:
            store.db
              .prepare(
                "SELECT value FROM metadata WHERE key='beam_onboarding_complete'",
              )
              .get()?.value === "true",
          hasData: store.list().length > 0 || notes.list().length > 0,
        });
      if (url.pathname === "/api/admin/ai/setup" && req.method === "GET")
        return send(200, await aiSetup.status());
      if (url.pathname === "/api/admin/collaboration" && req.method === "GET")
        return send(200, collaboration.state());
      if (
        url.pathname === "/api/admin/collaboration/events" &&
        req.method === "GET"
      ) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        res.write("data: " + JSON.stringify(collaboration.state()) + "\n\n");
        const unsubscribe = collaboration.onChange(() =>
          res.write("data: " + JSON.stringify(collaboration.state()) + "\n\n"),
        );
        const heartbeat = setInterval(
          () => res.write(": heartbeat\n\n"),
          20000,
        );
        req.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
        return;
      }
      if (
        url.pathname === "/api/admin/items" &&
        req.method === "GET" &&
        collaboration.active()
      ) {
        const result = await collaboration.items("GET", url.pathname);
        return send(result.status, result.data);
      }
      const attachmentFile = url.pathname.match(
        /^\/api\/admin\/attachments\/([a-f0-9-]+)$/,
      );
      if (attachmentFile && req.method === "GET") {
        const file = attachments.get(attachmentFile[1]);
        if (!file) return send(404, { error: "Fichier introuvable" });
        res.setHeader("Content-Type", file.mime);
        res.setHeader(
          "Content-Disposition",
          "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
        );
        res.setHeader("Content-Security-Policy", "sandbox");
        res.writeHead(200);
        return res.end(Buffer.from(file.bytes));
      }
      if (req.method === "GET") {
        if (url.pathname === "/api/admin/search")
          return send(200, searchIndex());
        if (url.pathname === "/api/admin/publications/options")
          return send(200, publications.options());
        if (url.pathname === "/api/admin/publications")
          return send(200, publications.list());
        if (url.pathname === "/api/public/publications")
          return send(200, publicPublications(publications.list()));
        if (url.pathname === "/api/admin/profile")
          return send(200, profile.get());
        if (url.pathname === "/api/admin/associations")
          return send(200, associations.list());
        if (url.pathname === "/api/admin/topics")
          return send(200, topics.list());
        if (url.pathname === "/api/admin/ai/activity")
          return send(200, activity());
        if (url.pathname === "/api/admin/ai/status")
          return send(200, await ai.status());
        if (url.pathname === "/api/admin/decisions")
          return send(200, decisions.list());
        if (url.pathname === "/api/admin/inbox")
          return send(
            200,
            buildInbox({
              reviews: ai.list(),
              notes: notes.list(),
              items: store.list(),
              topics: topics.list().topics,
              matches: associations.list().matches,
              decisions: decisions.list(),
            }),
          );
        if (url.pathname === "/api/admin/ai/reviews")
          return send(200, ai.list());
        if (url.pathname === "/api/admin/notes") return send(200, notes.list());
        if (
          url.pathname === "/api/public/product" ||
          url.pathname === "/api/admin/product"
        )
          return send(200, integrations.product());
        if (url.pathname === "/api/admin/sources")
          return send(200, integrations.list());
        if (url.pathname === "/api/admin/signals")
          return send(200, integrations.signals());
        if (url.pathname === "/api/admin/sync-runs")
          return send(200, integrations.runs());
        if (url.pathname === "/api/public/items")
          return send(200, store.list(true, visitor));
        if (url.pathname === "/api/admin/items")
          return send(200, store.list(false, visitor));
        if (url.pathname === "/api/admin/suggestions")
          return send(
            200,
            store.db
              .prepare("SELECT * FROM suggestions ORDER BY created DESC")
              .all(),
          );
        return send(404, { error: "Introuvable" });
      }
      if (
        req.headers.origin &&
        req.headers.origin !==
          `${prod && !desktop ? "https" : "http"}://${req.headers.host}`
      )
        return send(403, { error: "Origine refusée" });
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        chunks.push(chunk);
        bytes += chunk.length;
        if (
          bytes >
          (url.pathname.startsWith("/api/admin/backup") && admin
            ? 150000000
            : url.pathname.endsWith("/attachments") && admin
              ? 12000000
              : [
                    "/api/admin/profile",
                    "/api/admin/product",
                    "/api/admin/collaboration",
                  ].includes(url.pathname)
                ? 800000
                : admin && url.pathname.startsWith("/api/admin/publications")
                  ? 60000
                  : 20000)
        )
          return send(413, { error: "Contenu trop volumineux" });
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : {};
      if (
        admin &&
        !req.headers["x-beam-workspace"] &&
        !url.searchParams.get("workspace") &&
        workspaces.list().workspaces.length > 1
      )
        return send(409, {
          error:
            "Le workspace a changé ou cette fenêtre doit être actualisée. Rechargez Beam avant de continuer.",
        });
      if (url.pathname === "/api/admin/workspaces" && req.method === "POST") {
        const result = workspaces.create(body);
        context(result.active);
        return send(201, result);
      }
      if (
        url.pathname === "/api/admin/workspaces/select" &&
        req.method === "POST"
      ) {
        context(body.id);
        return send(200, workspaces.select(body.id));
      }
      if (url.pathname === "/api/admin/backup/preview" && req.method === "POST")
        return send(
          200,
          body.format === "beam-workspaces-backup"
            ? inspectWorkspaceBackup(body)
            : backups.inspect(body),
        );
      if (
        url.pathname === "/api/admin/backup/restore" &&
        req.method === "POST"
      ) {
        if (body.format !== "beam-workspaces-backup")
          return send(200, backups.restore(body));
        const summary = inspectWorkspaceBackup(body);
        for (const entry of body.workspaces) {
          const id = workspaces.create(
            { name: entry.name },
            { activate: false },
          ).createdWorkspaceId;
          context(id).backups.restore(entry.backup);
        }
        workspaces.select(workspaceId);
        return send(200, {
          ...summary,
          message:
            "Workspaces importés comme nouveaux espaces. Les espaces existants sont conservés.",
        });
      }
      if (url.pathname === "/api/admin/onboarding" && req.method === "POST") {
        store.db
          .prepare(
            "INSERT OR REPLACE INTO metadata VALUES('beam_onboarding_complete','true')",
          )
          .run();
        return send(200, { ok: true });
      }
      if (url.pathname === "/api/admin/ai/setup" && req.method === "POST")
        return send(202, await aiSetup.install());
      if (
        url.pathname === "/api/admin/collaboration" &&
        req.method === "POST"
      ) {
        if (body.action === "join") {
          const code = invitationCode(body.code);
          if (!code)
            throw Error(
              "Lien d’invitation invalide. Collez le lien reçu de votre collègue.",
            );
          if (!collaboration.state().signedIn)
            throw Error("Connectez-vous pour rejoindre ce workspace.");
          body.code = code;
        }
        let target = collaboration;
        let targetId = workspaceId;
        if (["join", "select"].includes(body.action)) {
          const existing =
            body.action === "select" &&
            workspaces.list().workspaces.find((w) => {
              const row = workspaces
                .store(w.id)
                .db.prepare(
                  "SELECT value FROM metadata WHERE key='beam_shared_workspace'",
                )
                .get();
              return row && JSON.parse(row.value)?.id === body.id;
            });
          targetId =
            existing?.id ||
            workspaces.create(
              { name: "Workspace de l’équipe" },
              { activate: false },
            ).createdWorkspaceId;
          target = context(targetId).collaboration;
          if (existing) {
            workspaces.select(targetId);
            return send(200, { ...target.state(), localWorkspaceId: targetId });
          }
        }
        const values =
          body.action === "create"
            ? {
                ...body,
                name: integrations.product().name,
                shareExisting: true,
              }
            : body;
        let result;
        try {
          result = await target.settings(body.action, values);
        } catch (error) {
          if (targetId !== workspaceId && !target.active()) {
            await target.close();
            contexts.delete(targetId);
            workspaces.discardEmpty(targetId);
          }
          throw error;
        }
        if (
          ["create", "join", "select"].includes(body.action) &&
          result.workspace
        ) {
          const product = context(targetId).integrations.product();
          await context(targetId).integrations.saveProduct({
            ...product,
            name: result.workspace.name.slice(0, 80),
          });
          const identity = personalProfile.get();
          if (identity.name)
            await target.settings("team-profile", identity).catch(() => {});
        }
        if (targetId !== workspaceId) {
          workspaces.select(targetId);
          result.localWorkspaceId = targetId;
        }
        workspaces.notify();
        return send(200, result);
      }
      if (
        /^\/api\/admin\/items(?:\/(?:kanban|reorder|[a-f0-9-]+(?:\/archive)?))?$/.test(
          url.pathname,
        ) &&
        collaboration.active()
      ) {
        const result = await collaboration.items(
          req.method,
          url.pathname,
          body,
        );
        return send(result.status, result.data);
      }
      if (
        url.pathname === "/api/admin/publications/generate" &&
        req.method === "POST"
      )
        return send(200, await publications.generate(body));
      if (url.pathname === "/api/admin/publications" && req.method === "POST")
        return send(201, publications.save(body));
      const publicationMatch = url.pathname.match(
        /^\/api\/admin\/publications\/([a-f0-9-]+)(?:\/(state))?$/,
      );
      if (publicationMatch) {
        if (req.method === "PATCH")
          return send(
            200,
            publicationMatch[2]
              ? publications.transition(publicationMatch[1], body.state)
              : publications.save(body, publicationMatch[1]),
          );
        if (req.method === "DELETE" && !publicationMatch[2]) {
          publications.remove(publicationMatch[1]);
          return send(200, { ok: true });
        }
      }
      if (url.pathname === "/api/admin/profile" && req.method === "PATCH") {
        const saved = await profile.save(body);
        const results = await Promise.allSettled(
          workspaces
            .list()
            .workspaces.filter((w) => w.shared)
            .map((w) =>
              context(w.id).collaboration.settings("team-profile", saved),
            ),
        );
        return send(200, {
          ...saved,
          teamSyncPending: results.some((r) => r.status === "rejected"),
        });
      }
      if (
        url.pathname === "/api/admin/associations/refresh" &&
        req.method === "POST"
      ) {
        void associations.refresh({ force: true, itemId: body.item_id });
        return send(202, { ok: true });
      }
      if (
        url.pathname === "/api/admin/associations/decide" &&
        req.method === "POST"
      ) {
        associations.decide(body.source, body.item_id, body.accept);
        return send(200, associations.list());
      }
      if (url.pathname === "/api/admin/topics" && req.method === "POST")
        return send(201, topics.create(body.title));
      if (
        url.pathname === "/api/admin/topics/refresh" &&
        req.method === "POST"
      ) {
        void topics.refresh();
        return send(202, { ok: true });
      }
      if (url.pathname === "/api/admin/topics/move" && req.method === "POST") {
        topics.move(body.source, body.topic_id);
        return send(200, topics.list());
      }
      const topicMatch = url.pathname.match(
        /^\/api\/admin\/topics\/([a-f0-9-]+)$/,
      );
      if (topicMatch && req.method === "PATCH") {
        if (body.title !== undefined) topics.rename(topicMatch[1], body.title);
        if (body.item_id !== undefined)
          topics.link(topicMatch[1], body.item_id);
        if (body.merge_into) topics.merge(topicMatch[1], body.merge_into);
        return send(200, topics.list());
      }
      if (url.pathname === "/api/admin/ai/settings" && req.method === "PATCH")
        return send(200, ai.configure(body.enabled));
      if (url.pathname === "/api/admin/ai/analyze" && req.method === "POST") {
        if (
          !["note", "feature"].includes(body.scope) ||
          typeof body.id !== "string"
        )
          return send(400, { error: "Analyse invalide" });
        return send(202, ai.enqueue(body.scope, body.id));
      }
      const review = url.pathname.match(
        /^\/api\/admin\/ai\/reviews\/([a-f0-9-]+)\/(apply|dismiss)$/,
      );
      if (review && req.method === "POST") {
        if (applyingReviews.has(review[1]))
          return send(409, {
            error: "Cette proposition est déjà en cours d’application.",
          });
        applyingReviews.add(review[1]);
        try {
          const sharedSave = collaboration.active()
            ? async (input, id) => {
                const result = await collaboration.items(
                  id ? "PATCH" : "POST",
                  "/api/admin/items" + (id ? "/" + id : ""),
                  { ...input, _revision: body._revision },
                );
                if (result.status >= 400) {
                  const error = Error(result.data.error);
                  error.status = result.status;
                  throw error;
                }
                return result.data.id;
              }
            : null;
          return send(
            200,
            review[2] === "apply"
              ? await ai.apply(review[1], body.index, sharedSave)
              : ai.dismiss(review[1], body.index),
          );
        } finally {
          applyingReviews.delete(review[1]);
        }
      }
      if (url.pathname === "/api/admin/notes" && req.method === "POST") {
        const note = notes.save(body);
        send(201, note);
        setImmediate(() => ai.auto(note));
        return;
      }
      const noteFiles = url.pathname.match(
        /^\/api\/admin\/notes\/([a-f0-9-]+)\/attachments$/,
      );
      if (noteFiles && req.method === "POST") {
        const file = await attachments.add(noteFiles[1], body);
        send(201, file);
        setImmediate(() =>
          ai.auto(notes.list().find((n) => n.id === noteFiles[1])),
        );
        return;
      }
      const noteMatch = url.pathname.match(
        /^\/api\/admin\/notes\/([a-f0-9-]+)$/,
      );
      if (noteMatch && req.method === "PATCH") {
        const note = notes.save(body, noteMatch[1]);
        send(200, note);
        if (body.text !== undefined) setImmediate(() => ai.auto(note));
        return;
      }
      if (url.pathname === "/api/admin/decisions" && req.method === "POST")
        return send(201, decisions.save(body));
      const decisionMatch = url.pathname.match(
        /^\/api\/admin\/decisions\/([a-f0-9-]+)$/,
      );
      if (decisionMatch && req.method === "PATCH")
        return send(200, decisions.decide(decisionMatch[1], body.state));
      if (url.pathname === "/api/admin/product" && req.method === "PATCH") {
        const product = await integrations.saveProduct(body);
        workspaces.notify();
        return send(200, product);
      }
      if (url.pathname === "/api/admin/sources" && req.method === "POST")
        return send(201, integrations.save(body));
      const sourceSetting = url.pathname.match(
        /^\/api\/admin\/sources\/([a-f0-9-]+)$/,
      );
      if (sourceSetting && req.method === "PATCH")
        return send(200, integrations.enable(sourceSetting[1], body.enabled));
      const sync = url.pathname.match(
        /^\/api\/admin\/sources\/([a-f0-9-]+)\/sync$/,
      );
      if (sync && req.method === "POST")
        return send(200, await integrations.sync(sync[1]));
      const signal = url.pathname.match(
        /^\/api\/admin\/signals\/([a-f0-9-]+)\/(link|promote)$/,
      );
      if (signal && req.method === "POST")
        return send(
          200,
          signal[2] === "promote"
            ? integrations.promote(signal[1])
            : integrations.link(signal[1], body.item_id, body.remove),
        );
      if (url.pathname === "/api/admin/items/kanban" && req.method === "POST") {
        store.reorderKanban(body.columns);
        return send(200, { ok: true });
      }
      if (
        url.pathname === "/api/admin/items/reorder" &&
        req.method === "POST"
      ) {
        store.reorder(body.id, body.target_id, body.after);
        return send(200, { ok: true });
      }
      if (url.pathname === "/api/admin/items" && req.method === "POST")
        return send(201, { id: store.save(body) });
      const archiveItem = url.pathname.match(
        /^\/api\/admin\/items\/([a-f0-9-]+)\/archive$/,
      );
      if (archiveItem && req.method === "PATCH") {
        store.archive(archiveItem[1], body.archived);
        return send(200, { ok: true });
      }
      const suggestionMatch = url.pathname.match(
        /^\/api\/admin\/suggestions\/([a-f0-9-]+)$/,
      );
      if (suggestionMatch && req.method === "PATCH") {
        store.suggestionAction(suggestionMatch[1], body.archived);
        return send(200, { ok: true });
      }
      if (suggestionMatch && req.method === "DELETE") {
        store.removeSuggestion(suggestionMatch[1]);
        return send(200, { ok: true });
      }
      const match = url.pathname.match(/^\/api\/admin\/items\/([a-f0-9-]+)$/);
      if (match) {
        if (req.method === "PATCH")
          return send(200, { id: store.save(body, match[1]) });
        if (req.method === "DELETE") {
          store.remove(match[1]);
          return send(200, { ok: true });
        }
      }
      const vote = url.pathname.match(
        /^\/api\/public\/items\/([a-f0-9-]+)\/vote$/,
      );
      if (vote && req.method === "POST") {
        store.vote(vote[1], visitor);
        return send(200, { ok: true });
      }
      if (url.pathname === "/api/public/suggestions" && req.method === "POST") {
        store.suggest(body.title, body.description);
        return send(201, { ok: true });
      }
      send(404, { error: "Introuvable" });
    });
  } catch (error) {
    send(error.status || 400, { error: error.message });
  }
});
server.listen(
  Number(process.env.PORT) || 5173,
  process.env.HOST || "127.0.0.1",
  () => console.log("Beam http://localhost:" + (process.env.PORT || 5173)),
);
