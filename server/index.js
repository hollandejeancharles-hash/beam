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
import { resolve, extname } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createIntegrations } from "./integrations.js";
import { createStore, seed } from "./store.js";
const prod = process.env.NODE_ENV === "production";
if (prod && !process.env.BEAM_ADMIN_TOKEN)
  throw Error("BEAM_ADMIN_TOKEN est requis en production");
mkdirSync("data", { recursive: true });
const store = createStore(process.env.BEAM_DB || "data/beam.sqlite");
const profile = createProfile(store);
const integrations = createIntegrations(store);
const notes = createNotes(store);
const attachments = createAttachments(store);
await startLocalAI();
const ai = createAI(store, notes, integrations);
const publications = createPublications(store, ai, fetch, {
  notes,
  integrations,
  discover: () => associations.refresh({ force: true }),
});
const associations = createAssociations(store, notes, integrations, ai);
ai.setDiscovery((id) => associations.refresh({ force: true, itemId: id }));
ai.resume();
const topics = createTopics(store, notes, integrations, ai);
const searchIndex = createSearch({
  store,
  notes,
  topics,
  integrations,
  publications,
});
const organizeSources = async () => {
  await associations.refresh();
  if (!ai.busy()) await topics.refresh();
};
setTimeout(() => void organizeSources(), 5000).unref();
setInterval(() => void organizeSources(), 60000).unref();
if (process.env.BEAM_SEED === "true") seed(store);
const vite = prod
  ? null
  : await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" });
const token = process.env.BEAM_ADMIN_TOKEN;
const authorized = (req) =>
  (!token && !prod) ||
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
    const path = resolve("dist", "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(resolve("dist") + "/") && path !== resolve("dist")) {
      res.writeHead(403);
      return res.end();
    }
    const file =
      existsSync(path) && extname(path) ? path : resolve("dist/index.html");
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
        `beam_visitor=${visitor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${prod ? "; Secure" : ""}`,
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
      if (url.pathname === "/api/admin/search") return send(200, searchIndex());
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
      if (url.pathname === "/api/admin/topics") return send(200, topics.list());
      if (url.pathname === "/api/admin/ai/activity")
        return send(200, activity());
      if (url.pathname === "/api/admin/ai/status")
        return send(200, await ai.status());
      if (url.pathname === "/api/admin/ai/reviews") return send(200, ai.list());
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
      req.headers.origin !== `${prod ? "https" : "http"}://${req.headers.host}`
    )
      return send(403, { error: "Origine refusée" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (
        raw.length >
        (url.pathname.endsWith("/attachments") && admin
          ? 12000000
          : url.pathname === "/api/admin/profile"
            ? 800000
            : admin && url.pathname.startsWith("/api/admin/publications")
              ? 60000
              : 20000)
      )
        return send(413, { error: "Contenu trop volumineux" });
    }
    const body = raw ? JSON.parse(raw) : {};
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
    if (url.pathname === "/api/admin/profile" && req.method === "PATCH")
      return send(200, await profile.save(body));
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
    if (url.pathname === "/api/admin/topics/refresh" && req.method === "POST") {
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
      if (body.item_id !== undefined) topics.link(topicMatch[1], body.item_id);
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
    if (review && req.method === "POST")
      return send(
        200,
        review[2] === "apply"
          ? ai.apply(review[1], body.index)
          : ai.dismiss(review[1], body.index),
      );
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
    const noteMatch = url.pathname.match(/^\/api\/admin\/notes\/([a-f0-9-]+)$/);
    if (noteMatch && req.method === "PATCH") {
      const note = notes.save(body, noteMatch[1]);
      send(200, note);
      if (body.text !== undefined) setImmediate(() => ai.auto(note));
      return;
    }
    if (url.pathname === "/api/admin/product" && req.method === "PATCH")
      return send(200, integrations.saveProduct(body));
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
    if (url.pathname === "/api/admin/items/reorder" && req.method === "POST") {
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
  } catch (error) {
    send(400, { error: error.message });
  }
});
server.listen(
  Number(process.env.PORT) || 5173,
  process.env.HOST || "127.0.0.1",
  () => console.log("Beam http://localhost:" + (process.env.PORT || 5173)),
);
