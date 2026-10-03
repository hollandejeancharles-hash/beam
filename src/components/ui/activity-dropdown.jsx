import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  MessageSquare,
  Activity,
  CheckCheck,
  Close,
  Link2,
} from "../../icons";
const icons = {
  comment: MessageSquare,
  change: Activity,
  ai: Activity,
  connection: Link2,
};
function relativeTime(value) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "À l’instant"
    : minutes < 60
      ? `${minutes} min`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} h`
        : `${Math.floor(minutes / 1440)} j`;
}
export function ActivityDropdown({ api, workspaceId, onNavigate }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState([]),
    [filter, setFilter] = useState("unread"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const root = useRef(null),
    trigger = useRef(null),
    apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    let alive = true;
    setRows([]);
    setOpen(false);
    setError("");
    const load = () =>
      apiRef
        .current("admin/notifications")
        .then((data) => {
          if (alive) {
            setRows(data.notifications);
            setError("");
          }
        })
        .catch(() => {
          if (alive)
            setError("Les notifications sont momentanément indisponibles.");
        });
    void load();
    const timer = setInterval(load, 30000);
    const update = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", update);
    window.addEventListener("beam:notes", update);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("beam:notes", update);
    };
  }, [workspaceId]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void apiRef
      .current("admin/notifications")
      .then((data) => {
        if (alive) {
          setRows(data.notifications);
          setError(data.warning || "");
        }
      })
      .catch(() => {
        if (alive) setError("Impossible d’actualiser les notifications.");
      });
    const outside = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, workspaceId]);
  async function read(ids) {
    if (!ids.length) return true;
    setBusy(true);
    try {
      await apiRef.current("admin/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      setRows((old) =>
        old.map((r) => (ids.includes(r.id) ? { ...r, read: true } : r)),
      );
      setError("");
      return true;
    } catch {
      setError("Impossible de marquer ces notifications comme lues.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const unread = rows.filter((r) => !r.read),
    visible = filter === "unread" ? unread : rows;
  return (
    <div className="notification-root" ref={root}>
      <button
        ref={trigger}
        className="icon-button notification-trigger"
        aria-label={`Notifications${unread.length ? `, ${unread.length} non lues` : ""}`}
        aria-expanded={open}
        aria-controls="beam-notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell size={17} />
        {unread.length > 0 && (
          <span className="notification-badge">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      <section
        id="beam-notifications"
        className={`activity-dropdown ${open ? "is-open" : ""}`}
        aria-label="Notifications"
        hidden={!open}
      >
        <header>
          <div className="notification-heading-icon">
            <Bell size={19} />
          </div>
          <div>
            <h2>Notifications</h2>
            <p>
              {unread.length ? `${unread.length} à lire` : "Vous êtes à jour"}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Fermer les notifications"
            onClick={() => setOpen(false)}
          >
            <Close size={16} />
          </button>
        </header>
        <div className="notification-toolbar">
          <div>
            <button
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              Non lues
            </button>
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              Toutes
            </button>
          </div>
          <button
            className="notification-read-all"
            disabled={busy || !unread.length}
            onClick={() => read(unread.map((r) => r.id))}
          >
            <CheckCheck size={14} />
            Tout lire
          </button>
        </div>
        {error && (
          <p className="notification-error" role="alert">
            {error}
          </p>
        )}
        <div className="notification-list">
          {visible.length ? (
            visible.map((row, index) => {
              const Icon = icons[row.kind] || Activity;
              return (
                <article
                  className={`notification-row ${row.read ? "is-read" : ""}`}
                  key={row.id}
                  style={{
                    "--notification-delay": `${Math.min(index, 5) * 35}ms`,
                  }}
                >
                  <button
                    className="notification-content"
                    onClick={() => {
                      void read([row.id]);
                      setOpen(false);
                      onNavigate(row.target);
                    }}
                  >
                    <span className="notification-row-icon">
                      <Icon size={17} />
                    </span>
                    <span className="notification-copy">
                      <strong>{row.title}</strong>
                      <span>{row.description}</span>
                      <time dateTime={row.created}>
                        {relativeTime(row.created)}
                      </time>
                    </span>
                  </button>
                  {!row.read && (
                    <button
                      className="notification-mark"
                      aria-label={`Marquer comme lu : ${row.title}`}
                      disabled={busy}
                      onClick={() => read([row.id])}
                    >
                      <CheckCheck size={14} />
                    </button>
                  )}
                </article>
              );
            })
          ) : (
            <div className="notification-empty">
              <CheckCheck size={24} />
              <strong>
                {filter === "unread"
                  ? "Rien à rattraper."
                  : "Le calme avant la prochaine idée."}
              </strong>
              <p>
                Les échanges de l’équipe et les propositions à examiner
                apparaîtront ici.
              </p>
            </div>
          )}
        </div>
        <footer>Votre workspace · Vos analyses IA restent sur ce Mac</footer>
      </section>
    </div>
  );
}
