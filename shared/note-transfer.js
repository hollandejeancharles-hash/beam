export const validTransferId = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
export function receiveNoteTransfer({
  local,
  session,
  workspaceId,
  transferId,
}) {
  if (!validTransferId(transferId))
    throw Error("Ce brouillon n’est pas disponible.");
  const slot = "note-capture:" + transferId;
  const draftKey = `beam-draft:${workspaceId}:${slot}`;
  if (session.getItem(draftKey) !== null) {
    session.setItem("beam-capture-composer:" + workspaceId, slot);
    return slot;
  }
  const key = "beam-note-transfer:" + transferId;
  const raw = local.getItem(key);
  if (!raw)
    throw Error(
      "Ce brouillon n’est plus disponible. Rouvrez la capture rapide.",
    );
  const payload = JSON.parse(raw);
  if (
    payload.workspaceId !== workspaceId ||
    typeof payload.text !== "string" ||
    payload.text.length > 40000
  )
    throw Error("Le brouillon appartient à un autre workspace.");
  session.setItem(draftKey, JSON.stringify(payload.text));
  if (payload.document?.type === "doc")
    session.setItem(draftKey + ":document", JSON.stringify(payload.document));
  session.setItem("beam-capture-composer:" + workspaceId, slot);
  const quickKey = "beam_note_draft:" + workspaceId;
  if (local.getItem(quickKey) === payload.text) local.setItem(quickKey, "");
  local.removeItem(key);
  return slot;
}
