import AIProgress from "./AIProgress";
import React, { useEffect, useRef, useState } from "react";
import { Activity, RefreshCw, CheckCheck, Close, FileText } from "../icons";

export default function AutoSources({
  item,
  api,
  onSignals,
  onNoteCount,
  onReviewCount,
  readOnly = false,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const signature = useRef("");
  async function load() {
    const next = await api("admin/associations");
    setData(next);
    const value = JSON.stringify(next.matches);
    if (signature.current !== value) onSignals(await api("admin/signals"));
    signature.current = value;
  }
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) load().catch((e) => setError(e.message));
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [item.id]);
  async function action(task) {
    setBusy(true);
    setError("");
    try {
      await task();
      await load();
      onSignals(await api("admin/signals"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const matches = (data?.matches || []).filter((m) => m.item_id === item.id);
  const notes = matches.filter(
    (m) => m.confidence === "clear" && m.source.startsWith("note:"),
  );
  useEffect(() => {
    onNoteCount?.(notes.length);
  }, [notes.length, item.id]);
  const review = matches.filter((m) => m.confidence === "review");
  useEffect(() => {
    onReviewCount?.(review.length);
  }, [review.length, item.id]);
  return (
    <div className="auto-sources">
      <div className="auto-source-heading">
        <AIProgress scope="associations" itemId={item.id} />
        <span>
          <Activity size={13} />
          {data?.running
            ? "Recherche de sources en cours…"
            : data?.enabled
              ? "Rapprochement automatique actif"
              : "Rapprochement automatique en pause"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Rechercher les sources pertinentes"
          disabled={busy || data?.running || !data?.enabled}
          onClick={() =>
            action(() =>
              api("admin/associations/refresh", {
                method: "POST",
                body: JSON.stringify({ item_id: item.id }),
              }),
            )
          }
        >
          <RefreshCw size={14} />
        </button>
      </div>
      {notes.map((m) => (
        <div key={m.source} className="auto-source-row">
          <details>
            <summary>
              <FileText size={13} />
              <span>{m.title}</span>
              <small>IA · Note</small>
            </summary>
            <p>{m.reason}</p>
            <blockquote>{m.evidence}</blockquote>
          </details>
          <button
            className="icon-button"
            type="button"
            aria-label={"Dissocier la note " + m.title}
            disabled={busy || readOnly}
            onClick={() =>
              action(() =>
                api("admin/associations/decide", {
                  method: "POST",
                  body: JSON.stringify({
                    source: m.source,
                    item_id: item.id,
                    accept: false,
                  }),
                }),
              )
            }
          >
            <Close size={13} />
          </button>
        </div>
      ))}
      {!!review.length && (
        <details className="auto-source-review">
          <summary>
            À vérifier <span>{review.length}</span>
          </summary>
          {review.map((m) => (
            <div className="auto-source-candidate" key={m.source}>
              <strong>{m.title}</strong>
              <p>{m.reason}</p>
              <blockquote>{m.evidence}</blockquote>
              <div>
                <button
                  type="button"
                  className="button"
                  disabled={busy || readOnly}
                  onClick={() =>
                    action(() =>
                      api("admin/associations/decide", {
                        method: "POST",
                        body: JSON.stringify({
                          source: m.source,
                          item_id: item.id,
                          accept: true,
                        }),
                      }),
                    )
                  }
                >
                  <CheckCheck size={13} />
                  Confirmer le lien
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || readOnly}
                  onClick={() =>
                    action(() =>
                      api("admin/associations/decide", {
                        method: "POST",
                        body: JSON.stringify({
                          source: m.source,
                          item_id: item.id,
                          accept: false,
                        }),
                      }),
                    )
                  }
                >
                  Écarter
                </button>
              </div>
            </div>
          ))}
        </details>
      )}
      {(error || data?.error) && (
        <p className="source-error" role="alert">
          {error || data.error}
        </p>
      )}
    </div>
  );
}
