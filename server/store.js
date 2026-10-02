import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
export const statuses = ["planned", "progress", "done"];
export function createStore(path) {
  const db = new DatabaseSync(path);
  db.exec(
    `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,visibility TEXT NOT NULL,quarter TEXT NOT NULL,created TEXT NOT NULL); CREATE TABLE IF NOT EXISTS votes(item TEXT,visitor TEXT,PRIMARY KEY(item,visitor)); CREATE TABLE IF NOT EXISTS suggestions(id TEXT PRIMARY KEY,title TEXT,description TEXT,created TEXT);`,
  );
  return {
    db,
    list(publicOnly = false, visitor = "") {
      return db
        .prepare(
          `SELECT i.*, (SELECT count(*) FROM votes WHERE item=i.id) AS votes, EXISTS(SELECT 1 FROM votes WHERE item=i.id AND visitor=?) AS voted FROM items i ${publicOnly ? "WHERE visibility='public'" : ""} ORDER BY created DESC`,
        )
        .all(visitor);
    },
    save(input, id = randomUUID()) {
      const old = db.prepare("SELECT * FROM items WHERE id=?").get(id);
      const v = { ...old, ...input };
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
        !["T4 2026", "T1 2027", "T2 2027"].includes(v.quarter)
      )
        throw Error("Informations invalides");
      db.prepare("INSERT OR REPLACE INTO items VALUES(?,?,?,?,?,?,?,?,?)").run(
        id,
        v.title.trim(),
        v.description,
        v.category,
        v.priority,
        v.status,
        v.visibility,
        v.quarter,
        old?.created || new Date().toISOString(),
      );
      return id;
    },
    remove(id) {
      db.prepare("DELETE FROM items WHERE id=?").run(id);
      db.prepare("DELETE FROM votes WHERE item=?").run(id);
    },
    vote(id, visitor) {
      if (
        !db
          .prepare("SELECT id FROM items WHERE id=? AND visibility='public'")
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
      db.prepare("INSERT INTO suggestions VALUES(?,?,?,?)").run(
        randomUUID(),
        title.trim(),
        description,
        new Date().toISOString(),
      );
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
