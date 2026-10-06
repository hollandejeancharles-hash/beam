import test from "node:test";
import assert from "node:assert/strict";
import { receiveNoteTransfer } from "../shared/note-transfer.js";
const token = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function storage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
test("Capture transfer preserves other drafts and only clears the transferred quick note after durable import", () => {
  const local = storage({
    ["beam-note-transfer:" + token]: JSON.stringify({
      workspaceId: "default",
      text: "Une idée",
    }),
    "beam_note_draft:default": "Une idée",
  });
  const session = storage({
    "beam-draft:default:note-composer": '"Autre brouillon"',
  });
  const slot = receiveNoteTransfer({
    local,
    session,
    workspaceId: "default",
    transferId: token,
  });
  assert.equal(slot, "note-capture:" + token);
  assert.equal(session.getItem("beam-draft:default:" + slot), '"Une idée"');
  assert.equal(
    session.getItem("beam-draft:default:note-composer"),
    '"Autre brouillon"',
  );
  assert.equal(local.getItem("beam_note_draft:default"), "");
  assert.equal(local.getItem("beam-note-transfer:" + token), null);
  assert.equal(
    receiveNoteTransfer({
      local,
      session,
      workspaceId: "default",
      transferId: token,
    }),
    slot,
  );
});
test("Workspace mismatch and storage failure keep the original capture intact", () => {
  const key = "beam-note-transfer:" + token,
    payload = JSON.stringify({ workspaceId: "first", text: "Privé" }),
    local = storage({ [key]: payload, "beam_note_draft:first": "Privé" });
  assert.throws(() =>
    receiveNoteTransfer({
      local,
      session: storage(),
      workspaceId: "second",
      transferId: token,
    }),
  );
  assert.equal(local.getItem(key), payload);
  const session = storage();
  session.setItem = () => {
    throw Error("Full");
  };
  assert.throws(() =>
    receiveNoteTransfer({
      local,
      session,
      workspaceId: "first",
      transferId: token,
    }),
  );
  assert.equal(local.getItem(key), payload);
  assert.equal(local.getItem("beam_note_draft:first"), "Privé");
});
test("A newer quick draft is never cleared by an earlier transfer", () => {
  const local = storage({
    ["beam-note-transfer:" + token]: JSON.stringify({
      workspaceId: "default",
      text: "Avant",
    }),
    "beam_note_draft:default": "Après",
  });
  receiveNoteTransfer({
    local,
    session: storage(),
    workspaceId: "default",
    transferId: token,
  });
  assert.equal(local.getItem("beam_note_draft:default"), "Après");
});

test("Capture transfer preserves rich mentions and formatting", () => {
  const document = {type:"doc", content:[{type:"paragraph",content:[{type:"mention",attrs:{workspace_id:"default",label:"Beam"}}]}]};
  const local=storage({["beam-note-transfer:"+token]:JSON.stringify({workspaceId:"default",text:"@Beam",document})});
  const session=storage();
  const slot=receiveNoteTransfer({local,session,workspaceId:"default",transferId:token});
  assert.deepEqual(JSON.parse(session.getItem(`beam-draft:default:${slot}:document`)),document);
});
