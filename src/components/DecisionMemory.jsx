import React, { useEffect, useState } from "react";
const kinds = {
  defer: "Report",
  prioritize: "Priorité",
  approve: "Validation",
  reject: "Idée écartée",
  decision: "Arbitrage",
};
export default function DecisionMemory({
  api,
  note,
  itemId,
  items,
  onError,
  onChange,
  onOpenNote,
  hideEmptyMessage = false,
}) {
  const [rows, setRows] = useState([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState(false),
    [draft, setDraft] = useState({
      title: "",
      reason: "",
      kind: "decision",
      item_ids: [],
    });
  async function load() {
    try {
      setRows(await api("admin/decisions"));
    } catch (e) {
      onError?.(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [note?.id, itemId]);
  const related = rows.filter((d) =>
    note ? d.note_id === note.id : d.item_ids.includes(itemId),
  );
  const visible = related.filter(
    (d) =>
      d.state === "confirmed" ||
      (d.state === "proposed" && (!note || note.text === d.source_text)) ||
      (history && d.state === "archived"),
  );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("admin/decisions", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          note_id: note.id,
          quote: note.text.slice(0, 3000),
        }),
      });
      setOpen(false);
      setDraft({ title: "", reason: "", kind: "decision", item_ids: [] });
      await load();
      await onChange?.();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(d, state = "archived") {
    setBusy(true);
    try {
      await api("admin/decisions/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({ state }),
      });
      await load();
      await onChange?.();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="decision-memory" aria-label="Mémoire des décisions">
      <div className="decision-memory-head">
        <h3>Décisions</h3>
        {note && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setOpen(!open)}
          >
            {open ? "Fermer" : "Noter une décision"}
          </button>
        )}
      </div>
      {!visible.length && !open && !hideEmptyMessage && (
        <p className="assistant-help">
          Aucun arbitrage validé. Les décisions confirmées ici guideront les
          prochaines analyses.
        </p>
      )}
      {visible.map((d) => (
        <article className="decision-memory-entry" key={d.id}>
          <small>
            {kinds[d.kind]} ·{" "}
            {new Date(d.confirmed || d.created).toLocaleDateString("fr-FR")}
            {d.state === "archived"
              ? " · Archivée"
              : d.state === "proposed"
                ? " · À confirmer"
                : ""}
          </small>
          <h4>{d.title}</h4>
          {d.reason && <p>{d.reason}</p>}
          <div className="decision-memory-links">
            {d.item_ids.map((id) => (
              <span key={id}>
                {items.find((i) => i.id === id)?.title || "Élément supprimé"}
              </span>
            ))}
          </div>
          <details>
            <summary>Voir la note source</summary>
            <blockquote>{d.quote}</blockquote>
            {onOpenNote && (
              <button
                className="text-button"
                onClick={() => onOpenNote(d.note_id)}
              >
                Ouvrir la note source
              </button>
            )}
          </details>
          {d.state === "proposed" && (
            <div className="modal-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => archive(d, "dismissed")}
              >
                Ignorer
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => archive(d, "confirmed")}
              >
                Confirmer la décision
              </button>
            </div>
          )}
          {d.state === "confirmed" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => archive(d)}
            >
              Archiver cette décision
            </button>
          )}
        </article>
      ))}
      {related.some((d) => d.state === "archived") && (
        <button className="text-button" onClick={() => setHistory(!history)}>
          {history ? "Masquer les archives" : "Voir les décisions archivées"}
        </button>
      )}
      {open && (
        <form className="decision-memory-form" onSubmit={save}>
          <p className="assistant-help">
            Enregistrez un choix acté. Il servira de contexte à l’IA sans
            changer les dates ou les priorités du Gantt.
          </p>
          <label>
            Décision
            <input
              required
              maxLength={160}
              value={draft.title}
              placeholder="Reporter le zoom après la refonte"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
            >
              {Object.entries(kinds).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pourquoi ? <span className="subtle">facultatif</span>
            <textarea
              maxLength={1000}
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Éléments concernés</legend>
            {items
              .filter((i) => !i.archived)
              .map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={draft.item_ids.includes(i.id)}
                    disabled={
                      !draft.item_ids.includes(i.id) &&
                      draft.item_ids.length >= 8
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        item_ids: e.target.checked
                          ? [...draft.item_ids, i.id]
                          : draft.item_ids.filter((id) => id !== i.id),
                      })
                    }
                  />
                  {i.title}
                </label>
              ))}
          </fieldset>
          <details>
            <summary>Note conservée comme preuve</summary>
            <blockquote>{note.text.slice(0, 3000)}</blockquote>
          </details>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Annuler
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Valider la décision"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
