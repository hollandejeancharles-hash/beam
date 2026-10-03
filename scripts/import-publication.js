import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { publicRoadmap } from "./public-roadmap.js";
import { publicPublications } from "../server/publications.js";
const path = "public/beam-publication.json";
if (existsSync(path)) {
  const file = JSON.parse(readFileSync(path, "utf8"));
  if (
    file.format !== "beam-publication" ||
    file.version !== 1 ||
    !Array.isArray(file.roadmap) ||
    !Array.isArray(file.publications) ||
    typeof file.product?.name !== "string"
  )
    throw Error("Export public Beam invalide.");
  const product = {
    name: file.product.name,
    description: file.product.description || "",
    image: file.product.image || null,
  };
  const publication = {
    format: "beam-publication",
    version: 1,
    roadmap: publicRoadmap(file.roadmap),
    product,
    publications: publicPublications(
      file.publications.map((row) => ({ ...row, state: "published" })),
    ),
  };
  writeFileSync(path, JSON.stringify(publication, null, 2));
  for (const [name, value] of Object.entries({
    roadmap: publicRoadmap(file.roadmap),
    product,
    publications: publicPublications(
      file.publications.map((row) => ({ ...row, state: "published" })),
    ),
  }))
    writeFileSync(`public/${name}.json`, JSON.stringify(value, null, 2));
}
