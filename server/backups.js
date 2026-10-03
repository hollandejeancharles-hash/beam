import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const TABLES = [
  "items",
  "votes",
  "suggestions",
  "notes",
  "note_attachments",
  "decisions",
  "sources",
  "signals",
  "signal_links",
  "sync_runs",
  "source_associations",
  "topics",
  "topic_members",
  "publications",
  "ai_reviews",
];
const META = ["product", "user_profile", "beam_onboarding_complete"];
export function createBackups(
  store,
  {
    directory = "data/backups",
    active = () => false,
    busy = () => false,
    restoreProfile = true,
  } = {},
) {
  const db = store.db;
  const tables = () =>
    TABLES.filter((t) =>
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(t),
    );
  function snapshot() {
    const data = Object.fromEntries(
      tables().map((t) => [
        t,
        db
          .prepare(`SELECT * FROM ${t}`)
          .all()
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                v instanceof Uint8Array
                  ? { base64: Buffer.from(v).toString("base64") }
                  : v,
              ]),
            ),
          ),
      ]),
    );
    // Tokens and login sessions are intentionally never exported.
    const metadata = Object.fromEntries(
      META.map((k) => [
        k,
        db.prepare("SELECT value FROM metadata WHERE key=?").get(k)?.value,
      ]).filter(([, v]) => v !== undefined),
    );
    return {
      format: "beam-backup",
      version: 1,
      created: new Date().toISOString(),
      sharedRoadmap: active(),
      data,
      metadata,
    };
  }
  function inspect(file) {
    if (
      !file ||
      file.format !== "beam-backup" ||
      file.version !== 1 ||
      !file.data ||
      typeof file.data !== "object" ||
      Array.isArray(file.data)
    )
      throw Error("Ce fichier n’est pas une sauvegarde Beam compatible.");
    const allowed = tables();
    for (const [t, rows] of Object.entries(file.data)) {
      if (!allowed.includes(t) || !Array.isArray(rows) || rows.length > 100000)
        throw Error("Sauvegarde invalide.");
      const columns = db
        .prepare(`PRAGMA table_info(${t})`)
        .all()
        .map((c) => c.name);
      for (const row of rows) {
        const jsonColumns = {
          notes: ["details"],
          ai_reviews: ["result", "context"],
          note_attachments: ["images"],
          topics: ["questions"],
          decisions: ["item_ids"],
          signals: ["extra"],
        };
        if (row && typeof row === "object")
          for (const key of jsonColumns[t] || []) {
            if (row[key] === null && key === "result") continue;
            if (typeof row[key] !== "string")
              throw Error("Contenu structuré de sauvegarde invalide.");
            const value = JSON.parse(row[key]);
            if (
              t === "notes" &&
              key === "details" &&
              (!value ||
                !Array.isArray(value.linked) ||
                !Array.isArray(value.tags) ||
                !Array.isArray(value.people))
            )
              throw Error("Classement de note invalide.");
            if (
              ["images", "questions", "item_ids"].includes(key) &&
              !Array.isArray(value)
            )
              throw Error("Liste de sauvegarde invalide.");
          }
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          Object.keys(row).some((k) => !columns.includes(k))
        )
          throw Error("Données de sauvegarde invalides.");
        for (const [k, v] of Object.entries(row))
          if (
            v &&
            typeof v === "object" &&
            !(
              t === "note_attachments" &&
              k === "bytes" &&
              typeof v.base64 === "string" &&
              /^[A-Za-z0-9+/]*={0,2}$/.test(v.base64)
            )
          )
            throw Error("Valeur de sauvegarde invalide.");
      }
    }
    if (
      !file.metadata ||
      typeof file.metadata !== "object" ||
      Object.entries(file.metadata).some(
        ([k, v]) => !META.includes(k) || typeof v !== "string",
      )
    )
      throw Error("Réglages de sauvegarde invalides.");
    for (const [k, v] of Object.entries(file.metadata)) {
      const parsed = JSON.parse(v);
      if (
        k !== "beam_onboarding_complete" &&
        (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      )
        throw Error("Réglages invalides.");
    }
    return {
      created: file.created,
      sharedRoadmap: !!file.sharedRoadmap,
      counts: Object.fromEntries(
        Object.entries(file.data).map(([t, rows]) => [t, rows.length]),
      ),
    };
  }
  function restore(file) {
    const summary = inspect(file);
    if (active())
      throw Error(
        "Revenez à votre roadmap locale avant de restaurer. La roadmap de l’équipe ne sera pas remplacée.",
      );
    if (busy())
      throw Error("Attendez la fin de l’analyse IA avant de restaurer.");
    if (tables().some((t) => !Object.hasOwn(file.data, t)))
      throw Error(
        "Cette sauvegarde est incomplète pour cette version de Beam.",
      );
    mkdirSync(directory, { recursive: true });
    const recovery = resolve(
      directory,
      `avant-restauration-${Date.now()}.json`,
    );
    writeFileSync(recovery, JSON.stringify(snapshot()), { mode: 0o600 });
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const t of tables().reverse()) db.exec(`DELETE FROM ${t}`);
      for (const [t, rows] of Object.entries(file.data))
        for (const row of rows) {
          const cols = Object.keys(row);
          if (!cols.length) throw Error("Ligne vide.");
          db.prepare(
            `INSERT INTO ${t}(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
          ).run(
            ...cols.map((k) =>
              row[k] && typeof row[k] === "object"
                ? Buffer.from(row[k].base64, "base64")
                : row[k],
            ),
          );
        }
      for (const k of META) {
        if (k === "user_profile" && !restoreProfile) continue;
        db.prepare("DELETE FROM metadata WHERE key=?").run(k);
        if (file.metadata[k] !== undefined)
          db.prepare("INSERT INTO metadata VALUES(?,?)").run(
            k,
            file.metadata[k],
          );
      }
      // Analyses interrupted on the exporting Mac are retried on a future edit.
      if (tables().includes("ai_reviews"))
        db.prepare(
          "UPDATE ai_reviews SET state='error',error='Analyse interrompue dans la sauvegarde. Relancez-la.' WHERE state IN ('queued','running')",
        ).run();
      db.prepare("DELETE FROM metadata WHERE key='topics_hash'").run();
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return {
      ...summary,
      recovery,
      message:
        "Sauvegarde restaurée. Une copie des données précédentes a été conservée sur ce Mac.",
    };
  }
  return { snapshot, inspect, restore };
}
