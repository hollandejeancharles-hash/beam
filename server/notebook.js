import { documentReferences } from "../shared/notebook-context.js";
import { createNotes } from "./notes.js";
import { createAttachments } from "./attachments.js";

// A personal view over existing databases: no destructive migration or duplicate notes.
export function createNotebook(workspaces) {
  const services = new Map();
  const items = () =>
    workspaces.list().workspaces.flatMap((w) => workspaces.store(w.id).list());
  const service = (id) => {
    if (!services.has(id)) {
      const store = workspaces.store(id);
      services.set(id, {
        notes: createNotes({ db: store.db, list: items }),
        attachments: createAttachments(store),
      });
    }
    return services.get(id);
  };
  const index = () => {
    const spaces = workspaces.list().workspaces,
      byItem = new Map();
    for (const w of spaces)
      for (const item of workspaces.store(w.id).list())
        byItem.set(item.id, [...(byItem.get(item.id) || []), w.id]);
    return { spaces, byItem };
  };
  const decorate = (n, id, snapshot = index()) => {
    const workspace_ids = n.workspace_ids ?? [id];
    const inferred = (n.linked || []).flatMap((item_id) =>
      (snapshot.byItem.get(item_id) || []).map((workspace_id) => ({
        workspace_id,
        item_id,
      })),
    );
    const proposals = [
      ...new Set(
        [
          ...(n.linked || []),
          ...(n.automatic_links || [])
            .filter((m) => m.confidence !== "rejected")
            .map((m) => m.item_id),
        ].flatMap((itemId) => snapshot.byItem.get(itemId) || []),
      ),
    ].filter((w) => !workspace_ids.includes(w));
    return {
      ...n,
      storage_workspace_id: id,
      workspace_ids,
      references: n.references?.length
        ? n.references
        : n.manual_fields?.includes("linked")
          ? inferred
          : [],
      proposed_workspace_ids: proposals,
    };
  };
  const list = (options) => {
    const snapshot = index(),
      unique = new Map();
    for (const w of snapshot.spaces)
      for (const n of service(w.id).notes.list({ trash: true }))
        if (!unique.has(n.id)) unique.set(n.id, decorate(n, w.id, snapshot));
    return [...unique.values()]
      .filter((n) => options?.trash || n.state !== "deleted")
      .sort((a, b) => b.created.localeCompare(a.created));
  };
  const owner = (id) => {
    for (const w of workspaces.list().workspaces)
      if (
        workspaces
          .store(w.id)
          .db.prepare("SELECT name FROM sqlite_master WHERE name='notes'")
          .get() &&
        workspaces
          .store(w.id)
          .db.prepare("SELECT 1 FROM notes WHERE id=?")
          .get(id)
      )
        return w.id;
    throw Error("Note introuvable");
  };
  const references = (values, previous = []) => {
    if (!Array.isArray(values) || values.length > 40)
      throw Error("Rattachements invalides");
    return values.map((r) => {
      const workspace = workspaces
        .list()
        .workspaces.find((w) => w.id === r.workspace_id);
      if (
        !workspace ||
        (r.item_id &&
          !workspaces
            .store(workspace.id)
            .list()
            .some((i) => i.id === r.item_id) &&
          !previous.some(
            (p) => p.workspace_id === r.workspace_id && p.item_id === r.item_id,
          ))
      )
        throw Error("Rattachement introuvable");
      return {
        workspace_id: workspace.id,
        ...(r.item_id ? { item_id: r.item_id } : {}),
      };
    });
  };
  const notebook = {
    list,
    owner,
    attachmentStore: {
      context(id) {
        return service(owner(id)).attachments.context(id);
      },
    },
    save(input, id, options) {
      const storage = id ? owner(id) : "default";
      const prior = id
        ? decorate(
            service(storage)
              .notes.list({ trash: true })
              .find((n) => n.id === id),
            storage,
          )
        : null;
      if (input.document) {
        const refs = documentReferences(input.document);
        input = {
          ...input,
          references: refs,
          ...(refs.some((r) => r.item_id)
            ? {
                classification: {
                  ...input.classification,
                  linked: refs
                    .filter(
                      (r) =>
                        r.item_id &&
                        workspaces
                          .store(r.workspace_id)
                          .list()
                          .some((i) => i.id === r.item_id),
                    )
                    .map((r) => r.item_id),
                },
              }
            : {}),
        };
      }
      if (input.references !== undefined)
        input = {
          ...input,
          references: references(input.references, prior?.references),
        };
      if (input.workspace_ids !== undefined) {
        if (
          !Array.isArray(input.workspace_ids) ||
          input.workspace_ids.some(
            (w) => !workspaces.list().workspaces.some((x) => x.id === w),
          )
        )
          throw Error("Workspace introuvable");
      }
      const next = {
        ...input,
        workspace_ids: [
          ...new Set([
            ...(input.workspace_ids ?? prior?.workspace_ids ?? []),
            ...(input.references || []).map((r) => r.workspace_id),
          ]),
        ],
      };
      return decorate(service(storage).notes.save(next, id, options), storage);
    },
    linkItem(noteId, itemId, workspaceId) {
      const n = notebook.list().find((n) => n.id === noteId);
      if (!n) throw Error("Note introuvable");
      return notebook.save(
        {
          references: [
            ...n.references,
            { workspace_id: workspaceId, item_id: itemId },
          ],
          workspace_ids: [...new Set([...n.workspace_ids, workspaceId])],
          classification: { linked: [...new Set([...n.linked, itemId])] },
        },
        noteId,
      );
    },
    addAttachment(id, body) {
      return service(owner(id)).attachments.add(id, body);
    },
    getAttachment(id) {
      for (const w of workspaces.list().workspaces) {
        const file = service(w.id).attachments.get(id);
        if (file) return file;
      }
    },
    scoped(workspaceId) {
      service(workspaceId);
      return {
        ...notebook,
        list: (options) =>
          list(options).filter(
            (n) =>
              n.workspace_ids.includes(workspaceId) ||
              (!n.workspace_ids.length && workspaceId === "default"),
          ),
      };
    },
    catalog() {
      return workspaces.list().workspaces.map((w) => ({
        ...w,
        items: workspaces
          .store(w.id)
          .list()
          .filter((i) => !i.archived),
      }));
    },
  };
  return notebook;
}
