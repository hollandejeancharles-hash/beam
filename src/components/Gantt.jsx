import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Flag,
  ChevronDown,
  Target,
} from "lucide-react";
import { Plus } from "../icons";
import {
  DAY,
  dateValue,
  isoDate,
  planningRange,
  progressValue,
  hierarchyRows,
  TYPES,
} from "../../shared/planning";
const ROW = 60;
const format = (date, options = { day: "numeric", month: "short" }) =>
  new Date(date).toLocaleDateString("fr-FR", { ...options, timeZone: "UTC" });
function monthStart(date) {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function shiftMonth(date, n) {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
}
export default function Gantt({
  items,
  allItems,
  readOnly,
  onOpen,
  onCreate,
  onSchedule,
}) {
  const today = isoDate(Date.now()),
    [anchor, setAnchor] = useState(monthStart(Date.now())),
    [zoom, setZoom] = useState("months"),
    [collapsed, setCollapsed] = useState(new Set()),
    [draft, setDraft] = useState(null),
    [pending, setPending] = useState(false);
  const [META, setMeta] = useState(window.innerWidth < 700 ? 220 : 360);
  useEffect(() => {
    const update = () => setMeta(window.innerWidth < 700 ? 220 : 360);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const drag = useRef(null);
  const ignoreClick = useRef(false);
  const start = zoom === "weeks" ? anchor : monthStart(anchor),
    end =
      zoom === "weeks"
        ? start + 56 * DAY
        : shiftMonth(start, zoom === "year" ? 12 : 6);
  const days = (end - start) / DAY,
    width = zoom === "weeks" ? 1008 : zoom === "year" ? 1440 : 1080,
    px = width / days;
  const rows = useMemo(
    () => hierarchyRows(items, collapsed),
    [items, collapsed],
  );
  const geometry = rows.map(({ item }) => {
    const range =
      draft?.id === item.id
        ? {
            start: dateValue(draft.start_date),
            end: dateValue(draft.end_date),
            estimated: false,
          }
        : planningRange(item, allItems);
    if (!range) return null;
    const left = Math.max(0, ((range.start - start) / DAY) * px),
      right = Math.min(width, ((range.end - start + DAY) / DAY) * px);
    return {
      ...range,
      left,
      right,
      visible: right > left && range.end >= start && range.start < end,
    };
  });
  const months = [];
  for (
    let cursor = monthStart(start);
    cursor < end;
    cursor = shiftMonth(cursor, 1)
  ) {
    const to = shiftMonth(cursor, 1);
    months.push({
      date: cursor,
      left: Math.max(0, ((cursor - start) / DAY) * px),
      width: ((Math.min(to, end) - Math.max(cursor, start)) / DAY) * px,
    });
  }
  const weeks = [];
  for (let cursor = start; cursor < end; cursor += 7 * DAY)
    weeks.push({ date: cursor, left: ((cursor - start) / DAY) * px });
  const total = items.length,
    active = items.filter((i) => i.status === "progress").length,
    undated = items.filter((i) => !i.start_date).length;
  function toggle(id) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function begin(event, item, mode) {
    if (readOnly || pending || !item.start_date || !item.end_date) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: item.id,
      item,
      mode,
      x: event.clientX,
      start: dateValue(item.start_date),
      end: dateValue(item.end_date),
    };
  }
  function moving(event) {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((event.clientX - d.x) / px);
    let from = d.start,
      to = d.end;
    if (d.mode === "move") {
      from += delta * DAY;
      to += delta * DAY;
    } else if (d.mode === "start") {
      from = Math.min(d.start + delta * DAY, to);
    } else {
      to = Math.max(d.end + delta * DAY, from);
    }
    setDraft({ id: d.id, start_date: isoDate(from), end_date: isoDate(to) });
  }
  async function finish(event) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const delta = Math.round((event.clientX - d.x) / px);
    let from = d.start,
      to = d.end;
    if (d.mode === "move") {
      from += delta * DAY;
      to += delta * DAY;
    } else if (d.mode === "start") from = Math.min(d.start + delta * DAY, to);
    else to = Math.max(d.end + delta * DAY, from);
    if (delta) {
      ignoreClick.current = d.mode === "move";
      setPending(true);
      try {
        await onSchedule(d.item, {
          start_date: isoDate(from),
          end_date: isoDate(to),
        });
      } finally {
        setPending(false);
      }
    }
    setDraft(null);
  }
  function fit() {
    const ranges = items.map((i) => planningRange(i, allItems)).filter(Boolean);
    if (ranges.length)
      setAnchor(monthStart(Math.min(...ranges.map((r) => r.start))));
  }
  return (
    <section
      className="gantt"
      aria-label="Gantt des initiatives, projets et features"
    >
      <div className="gantt-controls">
        <div className="gantt-summary">
          <strong>{total}</strong> éléments<span>·</span>
          {active} en cours<span>·</span>
          {undated} sans dates précises
        </div>
        <div className="gantt-tools">
          <button className="button" onClick={fit}>
            Voir le début
          </button>
          <button
            className="button"
            onClick={() => setAnchor(monthStart(Date.now()))}
          >
            Aujourd’hui
          </button>
          <div className="gantt-period">
            <button
              className="icon-button"
              aria-label="Période précédente"
              onClick={() =>
                setAnchor(
                  zoom === "weeks"
                    ? anchor - 56 * DAY
                    : shiftMonth(anchor, zoom === "year" ? -12 : -6),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {format(start, { month: "short", year: "numeric" })} —{" "}
              {format(end - DAY, { month: "short", year: "numeric" })}
            </span>
            <button
              className="icon-button"
              aria-label="Période suivante"
              onClick={() =>
                setAnchor(
                  zoom === "weeks"
                    ? anchor + 56 * DAY
                    : shiftMonth(anchor, zoom === "year" ? 12 : 6),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <select
            aria-label="Échelle du Gantt"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
          >
            <option value="weeks">Semaines</option>
            <option value="months">Mois</option>
            <option value="year">Année</option>
          </select>
        </div>
      </div>
      <div className="gantt-scroll">
        <div className="gantt-canvas" style={{ width: META + width }}>
          <div className="gantt-head">
            <div className="gantt-meta-head" style={{ width: META }}>
              <span>INITIATIVES / PROJETS / FEATURES</span>
              <span>PROGRÈS</span>
            </div>
            <div className="gantt-calendar" style={{ width }}>
              {months.map((m) => (
                <div
                  className="gantt-month"
                  key={m.date}
                  style={{ left: m.left, width: m.width }}
                >
                  {format(m.date, { month: "long", year: "numeric" })}
                </div>
              ))}
              <div className="gantt-weeks">
                {weeks.map((w) => (
                  <span key={w.date} style={{ left: w.left, width: 7 * px }}>
                    {format(w.date, {
                      day: "numeric",
                      month: zoom === "weeks" ? "short" : undefined,
                    })}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div
            className="gantt-body"
            style={{ height: Math.max(1, rows.length) * ROW }}
          >
            <div className="gantt-grid" style={{ left: META, width }}>
              {weeks.map((w) => (
                <i key={w.date} style={{ left: w.left }} />
              ))}
              {dateValue(today) >= start && dateValue(today) < end && (
                <div
                  className="gantt-today"
                  style={{ left: ((dateValue(today) - start) / DAY) * px }}
                >
                  <span>Aujourd’hui</span>
                </div>
              )}
            </div>
            <svg
              className="gantt-dependencies"
              aria-hidden="true"
              style={{ left: META, width, height: rows.length * ROW }}
            >
              <defs>
                <marker
                  id="dep-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0 0L6 3L0 6" fill="#757094" />
                </marker>
              </defs>
              {rows.map(({ item }, index) => {
                const sourceIndex = rows.findIndex(
                    (r) => r.item.id === item.dependency_id,
                  ),
                  from = geometry[sourceIndex],
                  to = geometry[index];
                if (!from?.visible || !to?.visible) return null;
                const x = from.right,
                  y = sourceIndex * ROW + ROW / 2,
                  targetY = index * ROW + ROW / 2;
                return (
                  <path
                    key={item.id}
                    d={`M ${x} ${y} H ${x + 9} V ${targetY} H ${to.left}`}
                    fill="none"
                    stroke="#757094"
                    strokeWidth="1.2"
                    strokeDasharray={from.end >= to.start ? "3 3" : undefined}
                    markerEnd="url(#dep-arrow)"
                  />
                );
              })}
            </svg>
            {rows.map(({ item, depth, hasChildren }, index) => {
              const range = geometry[index],
                progress = progressValue(item, allItems),
                dependency = allItems.find((i) => i.id === item.dependency_id),
                late = item.end_date && item.end_date < today && progress < 100;
              return (
                <div
                  className={"gantt-row kind-" + (item.type || "feature")}
                  key={item.id}
                  style={{ top: index * ROW, height: ROW }}
                >
                  <div
                    className="gantt-meta"
                    style={{ width: META, paddingLeft: 12 + depth * 18 }}
                  >
                    {hasChildren ? (
                      <button
                        className="icon-button gantt-collapse"
                        aria-label={
                          (collapsed.has(item.id) ? "Déplier " : "Replier ") +
                          item.title
                        }
                        aria-expanded={!collapsed.has(item.id)}
                        onClick={() => toggle(item.id)}
                      >
                        {collapsed.has(item.id) ? (
                          <ChevronRight size={13} />
                        ) : (
                          <ChevronDown size={13} />
                        )}
                      </button>
                    ) : (
                      <span className="gantt-collapse" />
                    )}
                    <span
                      className={"kind-mark " + (item.type || "feature")}
                      aria-label={TYPES[item.type || "feature"]}
                    />
                    <button className="gantt-name" onClick={() => onOpen(item)}>
                      <strong>{item.title}</strong>
                      <small>
                        {TYPES[item.type || "feature"]}
                        {item.owner ? " · " + item.owner : ""}
                        {late ? " · En retard" : ""}
                      </small>
                    </button>
                    <span
                      className="gantt-progress"
                      title={
                        hasChildren
                          ? "Moyenne des éléments enfants"
                          : "Avancement déclaré"
                      }
                    >
                      <span>
                        <i style={{ width: progress + "%" }} />
                      </span>
                      {progress}%
                    </span>
                  </div>
                  <div className="gantt-track" style={{ width, left: META }}>
                    {range?.visible ? (
                      <div
                        className={
                          "gantt-bar " +
                          item.status +
                          (range.estimated ? " estimated" : "") +
                          (range.derived ? " derived" : "") +
                          (late ? " overdue" : "")
                        }
                        style={{
                          left: range.left,
                          width: Math.max(8, range.right - range.left),
                        }}
                      >
                        {!readOnly && !range.estimated && !range.derived && (
                          <span
                            className="gantt-resize start"
                            title="Ajuster la date de début"
                            onPointerDown={(e) => begin(e, item, "start")}
                            onPointerMove={moving}
                            onPointerUp={finish}
                            onPointerCancel={() => {
                              drag.current = null;
                              setDraft(null);
                            }}
                          />
                        )}
                        <button
                          className="gantt-bar-body"
                          title={`${item.title} · ${range.estimated ? "Horizon estimé : " + item.quarter : format(range.start) + " → " + format(range.end)}${dependency ? " · Dépend de " + dependency.title : ""}`}
                          onClick={() => {
                            if (ignoreClick.current) {
                              ignoreClick.current = false;
                              return;
                            }
                            if (!draft) onOpen(item);
                          }}
                          onPointerDown={(e) => begin(e, item, "move")}
                          onPointerMove={moving}
                          onPointerUp={finish}
                          onPointerCancel={() => {
                            drag.current = null;
                            setDraft(null);
                          }}
                        >
                          <span
                            className="gantt-bar-fill"
                            style={{ width: progress + "%" }}
                          />
                          <span className="gantt-bar-text">
                            {range.estimated
                              ? "Horizon " + item.quarter
                              : item.title}
                          </span>
                          {late && <Flag size={12} />}
                        </button>
                        {!readOnly && !range.estimated && !range.derived && (
                          <span
                            className="gantt-resize end"
                            title="Ajuster la date de fin"
                            onPointerDown={(e) => begin(e, item, "end")}
                            onPointerMove={moving}
                            onPointerUp={finish}
                            onPointerCancel={() => {
                              drag.current = null;
                              setDraft(null);
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <button
                        className="gantt-outside"
                        onClick={() => onOpen(item)}
                      >
                        {range
                          ? "Hors de cette période"
                          : readOnly
                            ? "Dates à définir"
                            : "Planifier"}{" "}
                        <CalendarDays size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!rows.length && (
              <div className="gantt-empty">
                <Target size={24} />
                <strong>Aucun élément à afficher</strong>
                <span>
                  Créez une initiative, un projet ou une feature pour commencer.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="gantt-bottom">
        <div>
          <span className="legend-solid" />
          Dates précises
          <span className="legend-dashed" />
          Horizon estimé
          <span className="legend-dependency" />
          Dépendance
        </div>
        {!readOnly && (
          <button className="text-button" onClick={onCreate}>
            <Plus size={14} />
            Ajouter un élément
          </button>
        )}
      </div>
      {!readOnly && (
        <p className="gantt-help">
          Cliquez sur un élément pour le modifier. Déplacez une barre datée ou
          ajustez ses extrémités pour replanifier.
        </p>
      )}
    </section>
  );
}
