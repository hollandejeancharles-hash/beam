import { existsSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { publicRoadmap } from "./public-roadmap.js";
const file = process.env.BEAM_DB || "data/beam.sqlite";
if (!existsSync(file))
  throw Error("Base introuvable. Démarrer Beam localement avant l’export.");
const db = new DatabaseSync(file, { readOnly: true });
const entries = publicRoadmap(
  db.prepare("SELECT * FROM items ORDER BY created DESC").all(),
);
const product = JSON.parse(
  db.prepare("SELECT value FROM metadata WHERE key='product'").get()?.value ||
    '{"name":"PULS"}',
);
writeFileSync("public/product.json", JSON.stringify(product, null, 2) + "\n");
db.close();
writeFileSync("public/roadmap.json", JSON.stringify(entries, null, 2) + "\n");
console.log(
  `${entries.length} évolutions publiques exportées. Relire public/roadmap.json avant publication.`,
);
