import { randomUUID } from "node:crypto";
import {
  createCanvas,
  DOMMatrix,
  ImageData,
  Path2D,
  loadImage,
} from "@napi-rs/canvas";
globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;
const MAX = 8 * 1024 * 1024;
export function createAttachments(store) {
  const db = store.db;
  db.exec(
    "CREATE TABLE IF NOT EXISTS note_attachments(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,bytes BLOB NOT NULL,text TEXT NOT NULL,images TEXT NOT NULL,pages INTEGER NOT NULL)",
  );
  const list = (id) =>
    db
      .prepare(
        "SELECT id,name,mime,pages,length(bytes) AS size,text FROM note_attachments WHERE note_id=?",
      )
      .all(id);
  return {
    list,
    get(id) {
      return db.prepare("SELECT * FROM note_attachments WHERE id=?").get(id);
    },
    context(id) {
      return db
        .prepare(
          "SELECT id,name,text,images,pages FROM note_attachments WHERE note_id=?",
        )
        .all(id)
        .map((a) => ({ ...a, images: JSON.parse(a.images) }));
    },
    async add(noteId, input) {
      if (!db.prepare("SELECT id FROM notes WHERE id=?").get(noteId))
        throw Error("Note introuvable");
      if (list(noteId).length >= 4)
        throw Error("Maximum 4 pièces jointes par note");
      if (
        typeof input.name !== "string" ||
        input.name.length > 180 ||
        typeof input.data !== "string" ||
        input.data.length > MAX * 1.4
      )
        throw Error("Fichier invalide ou trop volumineux (8 Mo maximum)");
      const bytes = Buffer.from(input.data, "base64");
      if (!bytes.length || bytes.length > MAX)
        throw Error("Fichier trop volumineux");
      let text = "",
        images = [],
        pages = 1;
      if (input.mime === "application/pdf") {
        if (bytes.subarray(0, 5).toString() !== "%PDF-")
          throw Error("PDF invalide");
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = getDocument({
          data: new Uint8Array(bytes),
          isEvalSupported: false,
          useSystemFonts: true,
        });
        const pdf = await task.promise;
        try {
          pages = pdf.numPages;
          if (pages > 30)
            throw Error("Maximum 30 pages par PDF : divisez le document");
          for (let p = 1; p <= pages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const pageText = content.items.map((x) => x.str || "").join(" ");
            text += `\n[${input.name} · page ${p}]\n${pageText}\n`;
            if (text.length > 60000)
              throw Error("Document trop long : divisez le PDF");
            if (pageText.trim().length < 60) {
              if (images.length >= 6)
                throw Error(
                  "Maximum 6 pages scannées par PDF : divisez le document",
                );
              const viewport = page.getViewport({
                scale: Math.min(
                  1.5,
                  1200 /
                    Math.max(
                      page.getViewport({ scale: 1 }).width,
                      page.getViewport({ scale: 1 }).height,
                    ),
                ),
              });
              const canvas = createCanvas(
                Math.ceil(viewport.width),
                Math.ceil(viewport.height),
              );
              await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport,
              }).promise;
              images.push(canvas.toBuffer("image/png").toString("base64"));
              text += `[Page ${p} scannée : voir image ${images.length}]\n`;
            }
          }
        } finally {
          await task.destroy();
        }
      } else if (
        ["image/png", "image/jpeg", "image/webp"].includes(input.mime)
      ) {
        const img = await loadImage(bytes);
        if (img.width * img.height > 40000000) throw Error("Image trop grande");
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = createCanvas(
          Math.ceil(img.width * scale),
          Math.ceil(img.height * scale),
        );
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        images = [canvas.toBuffer("image/png").toString("base64")];
        text = `[Image jointe : ${input.name}]`;
      } else throw Error("Formats acceptés : PNG, JPEG, WebP et PDF");
      if (list(noteId).length >= 4)
        throw Error("Maximum 4 pièces jointes par note");
      const id = randomUUID();
      db.prepare("INSERT INTO note_attachments VALUES(?,?,?,?,?,?,?,?)").run(
        id,
        noteId,
        input.name,
        input.mime,
        bytes,
        text,
        JSON.stringify(images),
        pages,
      );
      return list(noteId).find((a) => a.id === id);
    },
  };
}
