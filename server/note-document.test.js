import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import {
  validateNoteDocument,
  noteDocumentText,
  plainNoteDocument,
} from "../shared/note-document.js";
import { createBackups } from "./backups.js";
test("rich notes retain formatting through classification and backup, and expose readable task context", () => {
  const store = createStore(":memory:"),
    notes = createNotes(store);
  const document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Board", marks: [{ type: "bold" }] }],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Valider les permissions" }],
              },
            ],
          },
        ],
      },
    ],
  };
  const n = notes.save({ text: "ignored", document });
  assert.equal(n.text, "Board\n[x] Valider les permissions");
  assert.deepEqual(n.document, document);
  assert.deepEqual(
    notes.save({ classification: { tags: ["Board"] } }, n.id, {
      automatic: true,
    }).document,
    document,
  );
  const backup = createBackups(store).snapshot();
  assert.deepEqual(JSON.parse(backup.data.notes[0].details).document, document);
  assert.equal(
    notes.save({ text: "Nouvelle note en texte simple" }, n.id).document,
    undefined,
  );
  store.db.close();
});
test("rich note documents reject executable marks and excessive depth or text", () => {
  assert.throws(() =>
    validateNoteDocument({
      type: "doc",
      content: [
        {
          type: "text",
          text: "click",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    }),
  );
  assert.throws(() =>
    validateNoteDocument({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "https://tracker.invalid/image" } },
      ],
    }),
  );
  assert.throws(() =>
    validateNoteDocument(plainNoteDocument("x".repeat(5001))),
  );
  assert.equal(
    noteDocumentText(
      validateNoteDocument(plainNoteDocument("<script>alert(1)</script>")),
    ),
    "<script>alert(1)</script>",
  );
});
