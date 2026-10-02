import { matchesFor, decideMatch } from "./associations.js";
import { randomUUID } from "node:crypto";
class SourceError extends Error {}
export const PROVIDERS = {
  github: { name: "GitHub", env: "BEAM_GITHUB_TOKEN" },
  ado: { name: "Azure DevOps", env: "BEAM_ADO_TOKEN" },
  notion: { name: "Notion", env: "BEAM_NOTION_TOKEN" },
  confluence: { name: "Confluence", env: "BEAM_CONFLUENCE_TOKEN" },
};
export function sourceConfig(input) {
  if (!Object.hasOwn(PROVIDERS, input.provider))
    throw new SourceError("Source inconnue");
  let u;
  try {
    u = new URL(input.url);
  } catch {
    throw new SourceError("Adresse de source invalide");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new SourceError("Utilisez une adresse HTTPS sans identifiants");
  const paths = u.pathname.split("/").filter(Boolean);
  let config = { url: u.href, scope: "" };
  if (input.provider === "github") {
    if (
      u.hostname !== "github.com" ||
      paths.length !== 2 ||
      !paths.every((x) => /^[\w.-]+$/.test(x))
    )
      throw new SourceError(
        "Adresse attendue : https://github.com/organisation/depot",
      );
    config = {
      url: `https://github.com/${paths.join("/")}`,
      scope: paths.join("/"),
    };
  } else if (input.provider === "ado") {
    if (
      u.hostname !== "dev.azure.com" ||
      paths.length !== 2 ||
      !paths.every((x) => /^[\w%.-]+$/.test(x))
    )
      throw new SourceError(
        "Adresse attendue : https://dev.azure.com/organisation/projet",
      );
    config = {
      url: `https://dev.azure.com/${paths.join("/")}`,
      scope: paths.join("/"),
    };
  } else if (input.provider === "confluence") {
    if (
      !/^[a-z0-9-]+\.atlassian\.net$/.test(u.hostname) ||
      !/^\d+$/.test(input.scope || "")
    )
      throw new SourceError(
        "Renseignez le site Confluence Cloud et l’identifiant numérique de l’espace",
      );
    config = { url: `https://${u.hostname}/wiki`, scope: input.scope };
  } else {
    const page = paths.at(-1)?.match(/([a-f0-9]{32}|[a-f0-9-]{36})$/i)?.[1];
    if (
      ![
        "notion.so",
        "www.notion.so",
        "notion.site",
        "www.notion.site",
      ].includes(u.hostname) &&
      !u.hostname.endsWith(".notion.site")
    )
      throw new SourceError("Adresse Notion attendue");
    if (!page)
      throw new SourceError(
        "Le lien doit contenir l’identifiant de la page Notion",
      );
    config.scope = page;
    config.url = u.origin + u.pathname;
  }
  return {
    provider: input.provider,
    label: String(input.label || PROVIDERS[input.provider].name).slice(0, 80),
    ...config,
  };
}
const text = (v) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
const rich = (rs) =>
  (rs || []).map((r) => r.plain_text || r.text?.content || "").join("");
export async function collectSource(
  source,
  { fetcher = fetch, env = process.env } = {},
) {
  const credential = env[PROVIDERS[source.provider].env];
  if (source.provider !== "github" && !credential)
    throw new SourceError("Accès serveur non configuré");
  let headers = { Accept: "application/json" };
  if (source.provider === "github" && credential)
    headers.Authorization = "Bearer " + credential;
  if (source.provider === "ado")
    headers.Authorization =
      "Basic " + Buffer.from(":" + credential).toString("base64");
  if (source.provider === "notion")
    headers = {
      ...headers,
      Authorization: "Bearer " + credential,
      "Notion-Version": "2025-09-03",
    };
  if (source.provider === "confluence") {
    if (!env.BEAM_CONFLUENCE_EMAIL)
      throw new SourceError("Compte Confluence non configuré sur le serveur");
    headers.Authorization =
      "Basic " +
      Buffer.from(env.BEAM_CONFLUENCE_EMAIL + ":" + credential).toString(
        "base64",
      );
  }
  let calls = 0,
    truncated = false;
  async function request(url, body) {
    if (++calls > 40)
      throw new SourceError("Périmètre trop large : limitez la source");
    const r = await fetcher(url, {
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new SourceError(
        r.status === 429
          ? "Limite de l’API atteinte. Réessayez plus tard."
          : `La source a refusé la lecture (${r.status}). Vérifiez ses accès.`,
      );
    const length = Number(r.headers?.get("content-length") || 0);
    if (length > 5_000_000) throw new SourceError("Réponse trop volumineuse");
    const raw = await r.text();
    if (raw.length > 5_000_000)
      throw new SourceError("Réponse trop volumineuse");
    return JSON.parse(raw);
  }
  let records = [];
  const add = (kind, id, title, url, state, body, updated, extra = {}) =>
    records.push({
      kind,
      external_id: String(id),
      title: text(title).slice(0, 300),
      url,
      state: text(state).slice(0, 100),
      body: text(body),
      updated: updated || null,
      ...extra,
    });
  if (source.provider === "github") {
    const base = "https://api.github.com/repos/" + source.scope;
    async function pages(path) {
      let rows = [];
      for (let p = 1; p <= 3; p++) {
        const v = await request(
          base +
            path +
            (path.includes("?") ? "&" : "?") +
            "per_page=100&page=" +
            p,
        );
        rows.push(...v);
        if (v.length < 100) return rows;
      }
      truncated = true;
      return rows;
    }
    for (const i of await pages(
      "/issues?state=all&sort=updated&direction=desc",
    ))
      if (!i.pull_request)
        add(
          "ticket",
          i.number,
          i.title,
          i.html_url,
          i.state,
          i.body,
          i.updated_at,
          {
            labels: i.labels?.map((x) => x.name) || [],
            owner: i.assignee?.login || "",
          },
        );
    for (const i of await pages("/pulls?state=all&sort=updated&direction=desc"))
      add(
        "pr",
        i.number,
        i.title,
        i.html_url,
        i.merged_at ? "merged" : i.state,
        i.body,
        i.updated_at,
        { owner: i.user?.login || "", branch: i.head?.ref || "" },
      );
    for (const i of await pages("/releases"))
      add(
        "release",
        i.id,
        i.name || i.tag_name,
        i.html_url,
        i.draft ? "draft" : i.prerelease ? "prerelease" : "published",
        i.body,
        i.published_at,
        { version: i.tag_name },
      );
    for (const i of await pages("/commits"))
      add(
        "commit",
        i.sha,
        i.commit.message,
        i.html_url,
        "committed",
        i.commit.message,
        i.commit.committer?.date,
        { sha: i.sha },
      );
    const runs = await request(base + "/actions/runs?per_page=100");
    truncated ||= runs.total_count > 100;
    for (const i of runs.workflow_runs || [])
      add(
        "build",
        i.id,
        i.display_title || i.name,
        i.html_url,
        i.conclusion || i.status,
        `Workflow : ${i.name}\nBranche : ${i.head_branch}\nCommit : ${i.head_sha}`,
        i.updated_at,
        { sha: i.head_sha, logs_url: i.html_url, workflow: i.name },
      );
  } else if (source.provider === "ado") {
    const base = source.url + "/_apis";
    const project = decodeURIComponent(source.scope.split("/")[1]);
    const q = await request(base + "/wit/wiql?$top=100&api-version=7.1", {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project.replaceAll("'", "''")}' ORDER BY [System.ChangedDate] DESC`,
    });
    truncated ||= (q.workItems || []).length === 100;
    if (q.workItems?.length) {
      const data = await request(base + "/wit/workitemsbatch?api-version=7.1", {
        ids: q.workItems.map((x) => x.id),
        fields: [
          "System.Title",
          "System.State",
          "System.Description",
          "System.WorkItemType",
          "System.ChangedDate",
          "System.AssignedTo",
        ],
      });
      for (const i of data.value) {
        const f = i.fields;
        add(
          "ticket",
          i.id,
          f["System.Title"],
          source.url + "/_workitems/edit/" + i.id,
          f["System.State"],
          f["System.Description"],
          f["System.ChangedDate"],
          {
            work_type: f["System.WorkItemType"],
            owner: f["System.AssignedTo"]?.displayName || "",
          },
        );
      }
    }
    const prs = await request(
      base +
        "/git/pullrequests?searchCriteria.status=all&$top=100&api-version=7.1",
    );
    for (const i of prs.value || [])
      add(
        "pr",
        i.pullRequestId,
        i.title,
        source.url +
          "/_git/" +
          encodeURIComponent(i.repository.name) +
          "/pullrequest/" +
          i.pullRequestId,
        i.status,
        i.description,
        i.closedDate || i.creationDate,
        { owner: i.createdBy?.displayName || "" },
      );
    const builds = await request(
      base + "/build/builds?$top=100&api-version=7.1",
    );
    for (const i of builds.value || [])
      add(
        "build",
        i.id,
        i.buildNumber,
        i._links.web.href,
        i.result || i.status,
        `Pipeline : ${i.definition.name}\nCommit : ${i.sourceVersion}`,
        i.finishTime || i.startTime,
        { version: i.buildNumber, logs_url: i._links.web.href },
      );
    truncated ||=
      (prs.value || []).length === 100 || (builds.value || []).length === 100;
  } else if (source.provider === "notion") {
    // Only the configured page and its explicitly nested pages are visited.
    const queue = [source.scope],
      seen = new Set();
    while (queue.length && seen.size < 10) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const page = await request("https://api.notion.com/v1/pages/" + id);
      const title =
        rich(
          Object.values(page.properties || {}).find((x) => x.type === "title")
            ?.title,
        ) || "Document Notion";
      let blocks = [],
        cursor;
      for (let p = 0; p < 3; p++) {
        const b = await request(
          "https://api.notion.com/v1/blocks/" +
            id +
            "/children?page_size=100" +
            (cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""),
        );
        blocks.push(...b.results);
        if (!b.has_more) break;
        cursor = b.next_cursor;
        if (p === 2) truncated = true;
      }
      for (const b of blocks) if (b.type === "child_page") queue.push(b.id);
      add(
        "document",
        page.id,
        title,
        page.url,
        page.archived ? "archived" : "active",
        blocks
          .map((b) => rich(b[b.type]?.rich_text) || b.child_page?.title || "")
          .join("\n"),
        page.last_edited_time,
      );
    }
    truncated ||= queue.length > 0;
  } else {
    let cursor;
    for (let p = 0; p < 3; p++) {
      const data = await request(
        source.url +
          "/api/v2/spaces/" +
          source.scope +
          "/pages?limit=100&body-format=storage" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      for (const i of data.results || [])
        add(
          "document",
          i.id,
          i.title,
          source.url + "/pages/viewpage.action?pageId=" + i.id,
          i.status,
          i.body?.storage?.value,
          i.version?.createdAt,
          { version: i.version?.number },
        );
      const next = data._links?.next;
      if (!next) break;
      cursor = new URL(next, source.url).searchParams.get("cursor");
      if (!cursor) throw new SourceError("Pagination Confluence inattendue");
      if (p === 2) truncated = true;
    }
  }
  return { records, truncated };
}
export function createIntegrations(
  store,
  { env = process.env, fetcher = fetch } = {},
) {
  const db = store.db;
  db.exec(
    `CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,provider TEXT,label TEXT,url TEXT,scope TEXT,last_sync TEXT,last_error TEXT,truncated INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS signals(id TEXT PRIMARY KEY,source_id TEXT,external_id TEXT,kind TEXT,title TEXT,url TEXT,state TEXT,body TEXT,updated TEXT,extra TEXT,UNIQUE(source_id,kind,external_id)); CREATE TABLE IF NOT EXISTS signal_links(signal_id TEXT,item_id TEXT,PRIMARY KEY(signal_id,item_id)); CREATE TABLE IF NOT EXISTS sync_runs(id TEXT PRIMARY KEY,source_id TEXT,started TEXT,finished TEXT,status TEXT,count INTEGER,message TEXT);`,
  );
  const columns = db.prepare("PRAGMA table_info(sources)").all();
  if (!columns.some((c) => c.name === "enabled"))
    db.exec(
      "ALTER TABLE sources ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
    );
  db.prepare(
    "UPDATE sync_runs SET status='error', finished=?, message='Lecture interrompue par un redémarrage du serveur' WHERE status='running'",
  ).run(new Date().toISOString());
  const busy = new Set();
  const list = () =>
    db
      .prepare("SELECT * FROM sources ORDER BY rowid")
      .all()
      .map((s) => ({
        ...s,
        configured:
          s.provider === "github" ||
          (Boolean(env[PROVIDERS[s.provider].env]) &&
            (s.provider !== "confluence" ||
              Boolean(env.BEAM_CONFLUENCE_EMAIL))),
        syncing: busy.has(s.id),
        count: db
          .prepare("SELECT count(*) AS n FROM signals WHERE source_id=?")
          .get(s.id).n,
      }));
  return {
    list,
    enable(id, enabled) {
      if (
        typeof enabled !== "boolean" ||
        !db.prepare("SELECT 1 FROM sources WHERE id=?").get(id)
      )
        throw new SourceError("Source invalide");
      if (busy.has(id)) throw new SourceError("Attendez la fin de la lecture");
      db.prepare("UPDATE sources SET enabled=? WHERE id=?").run(
        Number(enabled),
        id,
      );
      return { ok: true };
    },
    product() {
      return JSON.parse(
        db.prepare("SELECT value FROM metadata WHERE key='product'").get()
          ?.value || '{"name":"PULS"}',
      );
    },
    saveProduct(input) {
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 80
      )
        throw new SourceError("Nom du produit invalide");
      const product = { name: input.name.trim() };
      db.prepare("INSERT OR REPLACE INTO metadata VALUES('product',?)").run(
        JSON.stringify(product),
      );
      return product;
    },
    save(input) {
      const c = sourceConfig(input),
        id =
          input.id ||
          db
            .prepare(
              "SELECT id FROM sources WHERE provider=? AND url=? AND scope=?",
            )
            .get(c.provider, c.url, c.scope)?.id ||
          randomUUID();
      if (input.id) {
        const old = db.prepare("SELECT * FROM sources WHERE id=?").get(id);
        if (
          !old ||
          old.provider !== c.provider ||
          old.url !== c.url ||
          old.scope !== c.scope
        )
          throw new SourceError(
            "Ajoutez une nouvelle source pour changer son périmètre",
          );
      }
      db.prepare(
        "INSERT INTO sources(id,provider,label,url,scope) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label",
      ).run(id, c.provider, c.label, c.url, c.scope);
      return { id };
    },
    signals() {
      return db
        .prepare(
          "SELECT s.*,c.provider,c.label AS source_label FROM signals s JOIN sources c ON c.id=s.source_id ORDER BY s.updated DESC,s.rowid DESC",
        )
        .all()
        .map((s) => ({
          ...s,
          extra: JSON.parse(s.extra),
          automatic_links: matchesFor(db, "signal:" + s.id),
          links: [
            ...new Set([
              ...matchesFor(db, "signal:" + s.id)
                .filter((m) => m.confidence === "clear")
                .map((m) => m.item_id),
              ...db
                .prepare(
                  "SELECT l.item_id FROM signal_links l JOIN items i ON i.id=l.item_id WHERE signal_id=?",
                )
                .all(s.id)
                .map((x) => x.item_id),
            ]),
          ],
        }));
    },
    runs() {
      return db
        .prepare(
          "SELECT r.*,s.label FROM sync_runs r JOIN sources s ON s.id=r.source_id ORDER BY r.started DESC LIMIT 50",
        )
        .all();
    },
    link(signal_id, item_id, remove = false) {
      if (
        !db.prepare("SELECT 1 FROM signals WHERE id=?").get(signal_id) ||
        !db.prepare("SELECT 1 FROM items WHERE id=?").get(item_id)
      )
        throw new SourceError("Élément introuvable");
      db.prepare(
        remove
          ? "DELETE FROM signal_links WHERE signal_id=? AND item_id=?"
          : "INSERT OR IGNORE INTO signal_links VALUES(?,?)",
      ).run(signal_id, item_id);
      decideMatch(db, "signal:" + signal_id, item_id, !remove);
      return { ok: true };
    },
    promote(signal_id) {
      const s = db.prepare("SELECT * FROM signals WHERE id=?").get(signal_id);
      if (!s) throw new SourceError("Source introuvable");
      const existing = db
        .prepare(
          "SELECT item_id FROM signal_links l JOIN items i ON i.id=l.item_id WHERE signal_id=? LIMIT 1",
        )
        .get(signal_id);
      const automatic = matchesFor(db, "signal:" + signal_id).find(
        (m) => m.confidence === "clear",
      );
      if (existing || automatic)
        return { id: existing?.item_id || automatic.item_id };
      const d = new Date(),
        quarter = `T${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
      const id = store.save({
        title: s.title.slice(0, 140),
        description: (s.body + "\n\nSource : " + s.url).slice(0, 5000),
        type: "feature",
        status: "planned",
        priority: "medium",
        category: "Intégrations",
        visibility: "private",
        quarter,
      });
      db.prepare("INSERT INTO signal_links VALUES(?,?)").run(signal_id, id);
      return { id };
    },
    async sync(id) {
      const s = db.prepare("SELECT * FROM sources WHERE id=?").get(id);
      if (!s) throw new SourceError("Source introuvable");
      if (!s.enabled) throw new SourceError("Source en pause");
      if (busy.has(id)) throw new SourceError("Synchronisation déjà en cours");
      busy.add(id);
      const run = randomUUID();
      db.prepare(
        "INSERT INTO sync_runs(id,source_id,started,status,count) VALUES(?,?,?,'running',0)",
      ).run(run, id, new Date().toISOString());
      try {
        const { records, truncated } = await collectSource(s, { env, fetcher });
        db.exec("BEGIN");
        try {
          const put = db.prepare(
            "INSERT INTO signals VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,kind,external_id) DO UPDATE SET title=excluded.title,url=excluded.url,state=excluded.state,body=excluded.body,updated=excluded.updated,extra=excluded.extra",
          );
          for (const r of records) {
            let url;
            try {
              url = new URL(r.url);
            } catch {
              continue;
            }
            if (url.protocol !== "https:" || url.username || url.password)
              continue;
            put.run(
              randomUUID(),
              id,
              r.external_id,
              r.kind,
              r.title,
              r.url,
              r.state,
              r.body,
              r.updated,
              JSON.stringify(
                r.extra ||
                  Object.fromEntries(
                    Object.entries(r).filter(
                      ([k]) =>
                        ![
                          "kind",
                          "external_id",
                          "title",
                          "url",
                          "state",
                          "body",
                          "updated",
                        ].includes(k),
                    ),
                  ),
              ),
            );
          }
          const now = new Date().toISOString();
          db.prepare(
            "UPDATE sources SET last_sync=?,last_error=NULL,truncated=? WHERE id=?",
          ).run(now, Number(truncated), id);
          db.prepare(
            "UPDATE sync_runs SET finished=?,status='success',count=?,message=? WHERE id=?",
          ).run(
            now,
            records.length,
            truncated
              ? "Import limité aux éléments récents. Réduisez le périmètre pour une couverture complète."
              : "",
            run,
          );
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        return { count: records.length, truncated };
      } catch (error) {
        const message =
          error instanceof SourceError
            ? error.message
            : "La lecture a échoué. Vérifiez la disponibilité de la source.";
        db.prepare("UPDATE sources SET last_error=? WHERE id=?").run(
          message,
          id,
        );
        db.prepare(
          "UPDATE sync_runs SET finished=?,status='error',message=? WHERE id=?",
        ).run(new Date().toISOString(), message, run);
        throw new SourceError(message);
      } finally {
        busy.delete(id);
      }
    },
  };
}
