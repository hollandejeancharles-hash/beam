import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { interpretNote } from "../shared/notes.js";
test("notes recognize intent, explicit people, topics, dates and relevant roadmap links", () => {
  const n = interpretNote(
    "Relancer Sarah demain : prévisualisation temps réel #éditeur @Thomas",
    [
      { id: "p", title: "Prévisualisation en temps réel" },
      { id: "x", title: "Historique des versions" },
    ],
    new Date("2026-10-02T12:00:00"),
  );
  assert.equal(n.kind, "followup");
  assert.deepEqual(n.people, ["Thomas", "Sarah"]);
  assert.deepEqual(n.tags, ["éditeur"]);
  assert.equal(n.due, "2026-10-03");
  assert.deepEqual(n.linked, ["p"]);
  assert.equal(
    interpretNote(
      "Valide avec Marie vendredi",
      [],
      new Date("2026-10-02T12:00:00"),
    ).due,
    "2026-10-09",
  );
  assert.equal(interpretNote("Quelques mots libres").kind, "note");
  assert.deepEqual(interpretNote("Décision : rester simple").people, []);
  assert.deepEqual(interpretNote("Sarah : retour sur le pricing").people, [
    "Sarah",
  ]);
  assert.equal(
    interpretNote(
      "Envoyer le devis dans 3 jours",
      [],
      new Date("2026-10-02T12:00:00"),
    ).due,
    "2026-10-05",
  );
  assert.equal(interpretNote("idée : ajouter des modèles").kind, "idea");
});
test("private notes persist corrections, completion and reversible archives independently of roadmap", () => {
  const store = createStore(":memory:"),
    notes = createNotes(store);
  const n = notes.save({ text: "Envoyer le compte rendu à @Sarah demain" });
  assert.equal(n.kind, "action");
  assert.equal(notes.list().length, 1);
  assert.equal(store.list(true).length, 0);
  notes.save(
    {
      classification: {
        kind: "decision",
        people: ["Marie"],
        tags: ["atelier"],
        due: null,
        linked: [],
      },
    },
    n.id,
  );
  assert.equal(notes.list()[0].kind, "decision");
  notes.save({ state: "archived" }, n.id);
  assert.equal(notes.list()[0].people[0], "Marie");
  notes.save({ state: "open" }, n.id);
  assert.equal(notes.list()[0].state, "open");
  notes.save({ text: "Relancer Thomas" }, n.id);
  assert.equal(notes.list()[0].kind, "followup");
  assert.throws(() => notes.save({ text: " " }));
  assert.throws(() =>
    notes.save({ classification: { linked: ["missing"] } }, n.id),
  );
  assert.throws(() => notes.save({ state: "invalid" }, n.id));
  store.db.close();
});

test("converting a note links the new item without changing its content or existing links", () => {
  const s = createStore(":memory:"), n = createNotes(s);
  const item = (type) => s.save({title:"Suivi",description:"",category:"Éditeur",priority:"medium",status:"planned",visibility:"private",quarter:"T4 2026",type});
  const existing = item("feature"), task = item("task");
  const note = n.save({text:"Préparer la validation",classification:{linked:[existing]}});
  n.linkItem(note.id,task); n.linkItem(note.id,task);
  const linked = n.list().find(x=>x.id===note.id);
  assert.equal(linked.text,note.text);
  assert.deepEqual(linked.linked,[existing,task]);
  assert.throws(()=>n.linkItem("absent",task),/introuvable/);
  s.db.close();
});

test("trashed notes stay recoverable but are excluded from assistant sources",()=>{
 const s=createStore(":memory:"),notes=createNotes(s);const note=notes.save({text:"Contenu à conserver"});
 notes.save({state:"deleted"},note.id);assert.equal(notes.list().length,0);assert.equal(notes.list({trash:true})[0].text,note.text);
 notes.save({text:"Analyse tardive"},note.id,{automatic:true});assert.equal(notes.list({trash:true})[0].text,note.text);
 notes.save({state:"open"},note.id);assert.equal(notes.list()[0].text,note.text);s.db.close();
});
