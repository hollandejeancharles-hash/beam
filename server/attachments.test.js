import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createAttachments } from "./attachments.js";
function pdf() {
  const stream =
    "BT /F1 12 Tf 72 720 Td (Business requirement: permissions by product axis.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let s = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(s.length);
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = s.length;
  s +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(s);
}
test("attachments store private originals, extract PDF pages and normalize images locally", async () => {
  const s = createStore(":memory:"),
    notes = createNotes(s),
    a = createAttachments(s),
    n = notes.save({ text: "Business document" });
  const p = await a.add(n.id, {
    name: "requirements.pdf",
    mime: "application/pdf",
    data: pdf().toString("base64"),
  });
  assert.equal(p.pages, 1);
  assert.match(a.context(n.id)[0].text, /permissions by product axis/);
  assert.equal(notes.list()[0].attachments.length, 1);
  const canvas = createCanvas(20, 20);
  await a.add(n.id, {
    name: "capture.png",
    mime: "image/png",
    data: canvas.toBuffer("image/png").toString("base64"),
  });
  assert.equal(a.context(n.id)[1].images.length, 1);
  assert.equal(a.get(p.id).mime, "application/pdf");
  await assert.rejects(
    a.add(n.id, {
      name: "fake.pdf",
      mime: "application/pdf",
      data: Buffer.from("bad").toString("base64"),
    }),
  );
  await assert.rejects(
    a.add("missing", { name: "a", mime: "image/png", data: "a" }),
  );
  s.db.close();
});
