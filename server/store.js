import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { validatePlanning } from "../shared/planning.js";
export const statuses = ["planned", "progress", "done"];
export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,visibility TEXT NOT NULL,quarter TEXT NOT NULL,created TEXT NOT NULL); CREATE TABLE IF NOT EXISTS votes(item TEXT,visitor TEXT,PRIMARY KEY(item,visitor)); CREATE TABLE IF NOT EXISTS suggestions(id TEXT PRIMARY KEY,title TEXT,description TEXT,created TEXT);`,
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS source_associations(source TEXT,item_id TEXT,confidence TEXT NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL,locked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(source,item_id))",
  );
  const columns = new Set(
    db
      .prepare("PRAGMA table_info(items)")
      .all()
      .map((column) => column.name),
  );
  for (const [name, definition] of Object.entries({
    position: "INTEGER NOT NULL DEFAULT 0",
    kanban_position: "INTEGER NOT NULL DEFAULT 0",
    archived: "INTEGER NOT NULL DEFAULT 0",
    type: "TEXT NOT NULL DEFAULT 'feature'",
    parent_id: "TEXT",
    start_date: "TEXT",
    end_date: "TEXT",
    progress: "INTEGER NOT NULL DEFAULT 0",
    owner: "TEXT NOT NULL DEFAULT ''",
    dependency_id: "TEXT",
  })) {
    if (!columns.has(name))
      db.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition}`);
  }
  if (
    !db
      .prepare("PRAGMA table_info(suggestions)")
      .all()
      .some((c) => c.name === "archived")
  )
    db.exec(
      "ALTER TABLE suggestions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    );
  return {
    db,
    list(publicOnly = false, visitor = "") {
      return db
        .prepare(
          `SELECT i.*, (SELECT count(*) FROM votes WHERE item=i.id) AS votes, EXISTS(SELECT 1 FROM votes WHERE item=i.id AND visitor=?) AS voted FROM items i ${publicOnly ? "WHERE visibility='public' AND archived=0" : ""} ORDER BY position ASC, created DESC, id`,
        )
        .all(visitor)
        .map((item) => {
          if (!publicOnly) return item;
          const publicId = (id) =>
            id &&
            db
              .prepare(
                "SELECT 1 FROM items WHERE id=? AND visibility='public' AND archived=0",
              )
              .get(id)
              ? id
              : null;
          return {
            ...item,
            parent_id: publicId(item.parent_id),
            dependency_id: publicId(item.dependency_id),
          };
        });
    },
    save(input, id = randomUUID()) {
      const old = db.prepare("SELECT * FROM items WHERE id=?").get(id);
      const v = {
        type: "feature",
        parent_id: null,
        start_date: null,
        end_date: null,
        progress: 0,
        owner: "",
        dependency_id: null,
        ...old,
        ...input,
      };
      v.start_date ||= null;
      v.end_date ||= null;
      v.parent_id ||= null;
      v.dependency_id ||= null;
      if (v.status === "done") v.progress = 100;
      validatePlanning(v, id, db.prepare("SELECT * FROM items").all());
      if (
        typeof v.title !== "string" ||
        !v.title.trim() ||
        v.title.length > 140 ||
        typeof v.description !== "string" ||
        v.description.length > 5000 ||
        !statuses.includes(v.status) ||
        !["high", "medium", "low"].includes(v.priority) ||
        !["public", "private"].includes(v.visibility) ||
        ![
          "Éditeur",
          "Contenu",
          "Performance",
          "Collaboration",
          "Intégrations",
        ].includes(v.category) ||
        !/^T[1-4] 20\d{2}$/.test(v.quarter)
      )
        throw Error("Informations invalides");
      db.prepare(
        "INSERT OR REPLACE INTO items(id,title,description,category,priority,status,visibility,quarter,created,type,parent_id,start_date,end_date,progress,owner,dependency_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        v.title.trim(),
        v.description,
        v.category,
        v.priority,
        v.status,
        v.visibility,
        v.quarter,
        old?.created || new Date().toISOString(),
        v.type,
        v.parent_id,
        v.start_date,
        v.end_date,
        v.progress,
        v.owner.trim(),
        v.dependency_id,
      );
      if (old)
        db.prepare("UPDATE items SET position=? WHERE id=?").run(
          old.position || 0,
          id,
        );
      if (!old) {
        const max = db
          .prepare(
            "SELECT max(position) AS n FROM items WHERE id<>? AND parent_id IS ?",
          )
          .get(id, v.parent_id);
        db.prepare("UPDATE items SET position=? WHERE id=?").run(
          (max.n ?? -1) + 1,
          id,
        );
      }
      const rank =
        old?.status === v.status
          ? old.kanban_position
          : (db
              .prepare(
                "SELECT max(kanban_position) AS n FROM items WHERE status=? AND id<>?",
              )
              .get(v.status, id).n ?? -1) + 1;
      db.prepare("UPDATE items SET kanban_position=? WHERE id=?").run(rank, id);
      if (old?.archived)
        db.prepare("UPDATE items SET archived=1 WHERE id=?").run(id);
      return id;
    },
    reorderKanban(columns) {
      if (
        !Array.isArray(columns) ||
        columns.length !== statuses.length ||
        new Set(columns.map((c) => c.id)).size !== statuses.length ||
        columns.some((c) => !statuses.includes(c.id) || !Array.isArray(c.ids))
      )
        throw Error("Colonnes invalides");
      const all = db
        .prepare(
          "SELECT * FROM items WHERE archived=0 ORDER BY kanban_position,created DESC,id",
        )
        .all();
      const ids = columns.flatMap((c) => c.ids),
        visible = new Set(ids);
      if (
        ids.length !== visible.size ||
        ids.some((id) => !all.some((i) => i.id === id))
      )
        throw Error(
          "La roadmap a changé. Actualisez avant de déplacer cet élément.",
        );
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const column of columns) {
          let cursor = 0;
          const order = [];
          for (const item of all.filter((i) => i.status === column.id)) {
            if (visible.has(item.id)) {
              if (cursor < column.ids.length) order.push(column.ids[cursor++]);
            } else order.push(item.id);
          }
          order.push(...column.ids.slice(cursor));
          order.forEach((id, rank) => {
            const old = all.find((i) => i.id === id);
            const progress =
              column.id === "done"
                ? 100
                : old.status === "done"
                  ? 0
                  : old.progress;
            db.prepare(
              "UPDATE items SET status=?,progress=?,kanban_position=? WHERE id=?",
            ).run(column.id, progress, rank, id);
          });
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    reorder(id, targetId, after = false) {
      if (typeof after !== "boolean" || id === targetId)
        throw Error("Déplacement invalide");
      const all = db
          .prepare(
            "SELECT * FROM items WHERE archived=0 ORDER BY position,created DESC,id",
          )
          .all(),
        source = all.find((i) => i.id === id),
        target = all.find((i) => i.id === targetId);
      if (!source || !target || source.parent_id !== target.parent_id)
        throw Error("Déplacez l’élément parmi les éléments du même parent");
      const siblings = all.filter(
        (i) => i.parent_id === source.parent_id && i.id !== id,
      );
      const index =
        siblings.findIndex((i) => i.id === targetId) + (after ? 1 : 0);
      siblings.splice(index, 0, source);
      db.exec("BEGIN IMMEDIATE");
      try {
        siblings.forEach((i, index) =>
          db.prepare("UPDATE items SET position=? WHERE id=?").run(index, i.id),
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    archive(id, archived) {
      if (typeof archived !== "boolean") throw Error("Archivage invalide");
      if (
        !db
          .prepare("UPDATE items SET archived=? WHERE id=?")
          .run(Number(archived), id).changes
      )
        throw Error("Introuvable");
    },
    suggestionAction(id, archived) {
      if (typeof archived !== "boolean") throw Error("Archivage invalide");
      if (
        !db
          .prepare("UPDATE suggestions SET archived=? WHERE id=?")
          .run(Number(archived), id).changes
      )
        throw Error("Introuvable");
    },
    removeSuggestion(id) {
      db.prepare("DELETE FROM suggestions WHERE id=?").run(id);
    },
    remove(id) {
      db.prepare("UPDATE items SET parent_id=NULL WHERE parent_id=?").run(id);
      db.prepare(
        "UPDATE items SET dependency_id=NULL WHERE dependency_id=?",
      ).run(id);
      if (
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='signal_links'")
          .get()
      )
        db.prepare("DELETE FROM signal_links WHERE item_id=?").run(id);
      if (
        db.prepare("SELECT name FROM sqlite_master WHERE name='notes'").get()
      ) {
        for (const n of db.prepare("SELECT id,details FROM notes").all()) {
          const d = JSON.parse(n.details);
          d.linked = (d.linked || []).filter((x) => x !== id);
          db.prepare("UPDATE notes SET details=? WHERE id=?").run(
            JSON.stringify(d),
            n.id,
          );
        }
      }
      db.prepare("DELETE FROM source_associations WHERE item_id=?").run(id);
      db.prepare("DELETE FROM items WHERE id=?").run(id);
      db.prepare("DELETE FROM votes WHERE item=?").run(id);
    },
    vote(id, visitor) {
      if (
        !db
          .prepare(
            "SELECT id FROM items WHERE id=? AND visibility='public' AND archived=0",
          )
          .get(id)
      )
        throw Error("Introuvable");
      const exists = db
        .prepare("SELECT 1 FROM votes WHERE item=? AND visitor=?")
        .get(id, visitor);
      db.prepare(
        exists
          ? "DELETE FROM votes WHERE item=? AND visitor=?"
          : "INSERT INTO votes VALUES(?,?)",
      ).run(id, visitor);
    },
    suggest(title, description) {
      if (
        typeof title !== "string" ||
        !title.trim() ||
        title.length > 140 ||
        typeof description !== "string" ||
        description.length > 5000
      )
        throw Error("Suggestion invalide");
      db.prepare(
        "INSERT INTO suggestions(id,title,description,created) VALUES(?,?,?,?)",
      ).run(randomUUID(), title.trim(), description, new Date().toISOString());
    },
  };
}
export function seed(store) {
  if (store.db.prepare("SELECT 1 FROM metadata WHERE key='seeded'").get())
    return;
  if (store.list().length) {
    store.db.prepare("INSERT INTO metadata VALUES('seeded','true')").run();
    return;
  }
  const rows = [
    [
      "Un éditeur qui suit vos idées",
      "Une nouvelle expérience d’édition par blocs. Composez, déplacez et publiez vos contenus sans interrompre votre élan.",
      "Éditeur",
      "high",
      "progress",
    ],
    [
      "Prévisualisation en temps réel",
      "Voyez exactement ce que vos lecteurs verront, sur tous les écrans, avant de publier.",
      "Éditeur",
      "high",
      "progress",
    ],
    [
      "Une médiathèque mieux organisée",
      "Dossiers, recherche et descriptions alternatives : chaque média trouve sa place.",
      "Contenu",
      "medium",
      "progress",
    ],
    [
      "Publier dans plusieurs langues",
      "Créez et gérez les versions traduites de vos pages depuis un espace commun.",
      "Contenu",
      "high",
      "planned",
    ],
    [
      "Vos outils, enfin connectés",
      "Connectez PULS à vos outils grâce aux webhooks et à une API documentée.",
      "Intégrations",
      "medium",
      "planned",
    ],
    [
      "Les bons rôles, au bon endroit",
      "Des permissions précises pour travailler ensemble en toute confiance.",
      "Collaboration",
      "medium",
      "planned",
    ],
    [
      "Des pages plus rapides",
      "Une optimisation du chargement des images et du cache pour une navigation plus fluide.",
      "Performance",
      "high",
      "done",
    ],
    [
      "Historique des versions",
      "Retrouvez une ancienne version de votre contenu et restaurez-la en un clic.",
      "Contenu",
      "medium",
      "done",
    ],
    [
      "Des liens qui restent vivants",
      "Gérez vos redirections directement dans PULS pour ne perdre aucun visiteur.",
      "Performance",
      "low",
      "done",
    ],
  ];
  rows.forEach(([title, description, category, priority, status]) =>
    store.save({
      title,
      description,
      category,
      priority,
      status,
      visibility: "public",
      quarter: status === "planned" ? "T1 2027" : "T4 2026",
    }),
  );
  store.db.prepare("INSERT INTO metadata VALUES('seeded','true')").run();
}
