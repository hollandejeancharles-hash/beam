import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createWorkspaces } from "./workspaces.js";
import { createNotebook } from "./notebook.js";
import { storedNoteReviews } from "./ai.js";
import { createNotes } from "./notes.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conversionContext } from "../shared/notebook-context.js";
import {
  validateNoteDocument,
  noteDocumentText,
} from "../shared/note-document.js";

test("personal notebook preserves legacy workspace notes, attachments and ownership without duplicating or sharing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "beam-notebook-")),
    root = createStore(join(dir, "test.sqlite")),
    workspaces = createWorkspaces(root, join(dir, "test.sqlite"));
  try {
    const second = workspaces.create({ name: "Second" }).active;
    const legacy = createNotes(workspaces.store(second)).save({
      text: "Ancienne note personnelle",
    });
    const notebook = createNotebook(workspaces);
    assert.equal(notebook.list().length, 1);
    workspaces
      .store(second)
      .db.prepare("INSERT INTO note_attachments VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "fixture-file",
        legacy.id,
        "contexte.pdf",
        "application/pdf",
        Buffer.from("fixture"),
        "Contexte métier",
        "[]",
        1,
      );
    assert.equal(notebook.getAttachment("fixture-file").note_id, legacy.id);
    assert.equal(
      notebook.attachmentStore.context(legacy.id)[0].text,
      "Contexte métier",
    );
    assert.deepEqual(notebook.list()[0].workspace_ids, [second]);
    const unassigned = notebook.save({ text: "Capture libre" });
    assert.deepEqual(unassigned.workspace_ids, []);
    const parent = workspaces.store(second).save({
      type: "project",
      title: "Projet partagé",
      description: "",
      category: "Éditeur",
      priority: "medium",
      status: "planned",
      visibility: "private",
      quarter: "T4 2026",
    });
    const document = validateNoteDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Travailler sur " },
            {
              type: "mention",
              attrs: {
                label: "Projet partagé",
                workspace_id: second,
                item_id: parent,
              },
            },
          ],
        },
      ],
    });
    const linked = notebook.save({ document }, unassigned.id);
    assert.deepEqual(linked.workspace_ids, [second]);
    assert.deepEqual(linked.linked, [parent]);
    assert.equal(noteDocumentText(document), "Travailler sur @Projet partagé");
    assert.deepEqual(
      conversionContext(linked, notebook.catalog(), "default", "task"),
      { workspaceId: second, parentId: parent, ambiguous: false },
    );
    notebook.save({ text: "Ancienne note modifiée" }, legacy.id);
    assert.equal(
      createNotes(workspaces.store(second)).list()[0].text,
      "Ancienne note modifiée",
    );
    assert.equal(notebook.list().length, 2);
    assert.equal(root.list().length, 0);
    notebook.save({ state: "deleted" }, linked.id);
    assert.equal(notebook.list().length, 1);
    assert.equal(notebook.list({ trash: true }).length, 2);
    notebook.save({ state: "open" }, linked.id);
    assert.equal(notebook.list().length, 2);
    workspaces.store(second).remove(parent);
    const retained = notebook.save({ document }, unassigned.id);
    assert.equal(retained.text, "Travailler sur @Projet partagé");
    assert.deepEqual(retained.linked, []);
    assert.throws(
      () =>
        notebook.save({
          text: "Invalide",
          references: [{ workspace_id: "unknown" }],
        }),
      /introuvable/,
    );
  } finally {
    for (const w of workspaces.list().workspaces)
      workspaces.store(w.id).db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("conversion context resolves explicit item workspace before broad workspace mentions and exposes ambiguity", () => {
  const catalog = [
    { id: "a", items: [{ id: "p", type: "initiative" }] },
    { id: "b", items: [] },
  ];
  assert.deepEqual(
    conversionContext(
      {
        workspace_ids: ["a", "b"],
        references: [{ workspace_id: "a", item_id: "p" }],
      },
      catalog,
      "b",
      "feature",
    ),
    { workspaceId: "a", parentId: "p", ambiguous: false },
  );
  assert.equal(
    conversionContext({ workspace_ids: ["a", "b"] }, catalog, "b", "task")
      .ambiguous,
    true,
  );
  assert.equal(
    conversionContext({ workspace_ids: [] }, catalog, "b", "task").workspaceId,
    "b",
  );
});

test("mentions retain priority over links created by previous conversions", () => {
  const note = {
    workspace_ids: ["a"],
    references: [
      { workspace_id: "a", item_id: "initiative" },
      { workspace_id: "a", item_id: "converted" },
    ],
    document: {
      type: "doc",
      content: [
        {
          type: "mention",
          attrs: {
            workspace_id: "a",
            item_id: "initiative",
            label: "Initiative",
          },
        },
      ],
    },
  };
  const catalog = [
    {
      id: "a",
      items: [
        { id: "initiative", type: "initiative" },
        { id: "converted", type: "feature" },
      ],
    },
  ];
  assert.equal(
    conversionContext(note, catalog, "a", "demand").parentId,
    "initiative",
  );
});

test("mentioning a task persists its workspace and roadmap link", () => {
  const dir=mkdtempSync(join(tmpdir(), "beam-task-mention-"));
  const path=join(dir,"test.sqlite"), root=createStore(path), workspaces=createWorkspaces(root,path);
  try {
    const workspace=workspaces.create({name:"Travail"}).active;
    const id=workspaces.store(workspace).save({type:"task",title:"Vérifier le lancement",description:"",category:"Éditeur",priority:"medium",status:"planned",visibility:"private",quarter:"T4 2026"});
    const notebook=createNotebook(workspaces);
    const note=notebook.save({document:{type:"doc",content:[{type:"paragraph",content:[{type:"mention",attrs:{workspace_id:workspace,item_id:id,label:"Vérifier le lancement"}}]}]}});
    assert.deepEqual(note.workspace_ids,[workspace]);
    assert.deepEqual(note.linked,[id]);
    assert.equal(notebook.catalog().find(w=>w.id===workspace).items.find(i=>i.id===id).type,"task");
  } finally {root.db.close(); rmSync(dir,{recursive:true,force:true});}
});

test("reading reviews of an unused workspace does not initialize AI services", () => {
  const root=createStore(":memory:");
  try {
    assert.deepEqual(storedNoteReviews(root.db),[]);
    assert.equal(root.db.prepare("SELECT name FROM sqlite_master WHERE name='ai_reviews'").get(),undefined);
  } finally {root.db.close();}
});
