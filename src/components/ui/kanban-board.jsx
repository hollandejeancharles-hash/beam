import * as React from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  LayoutDashboard,
  Monitor,
  Palette,
  Server,
  Smartphone,
} from "lucide-react";
import {
  Planning as CalendarDays,
  FileText,
  ArrowUp as Flag,
  Plus,
} from "../../icons";
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
const SQUIRCLE = "[corner-shape:squircle]";
const FONT_STACK =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CHIP =
  "inline-flex h-[22px] items-center gap-1 rounded-[7px] px-2 text-[11px] leading-none";
const GAP = 8;
const LIFT_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };
const FLOW_SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 };
const PRIORITY_STYLES = {
  urgent: "bg-rose-50 text-rose-600 dark:bg-rose-500/12 dark:text-rose-300",
  high: "bg-amber-50 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300",
  normal: "bg-blue-50 text-blue-600 dark:bg-blue-500/12 dark:text-blue-300",
  low: "bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400",
};
const PRIORITY_LABELS = {
  urgent: "Urgent",
  high: "Haute",
  normal: "Normale",
  low: "Basse",
};
const ACCENT_DOT = {
  slate: "bg-neutral-400",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
};
const KanbanBoard = React.forwardRef(function KanbanBoard2(
  {
    columns,
    onChange,
    onOpen,
    onCreate,
    readOnly = false,
    label = "Roadmap par \xE9tat",
    className,
    style,
    ...props
  },
  ref,
) {
  const [cols, setCols] = React.useState(columns);
  const [drag, setDrag] = React.useState(null);
  const [slot, setSlot] = React.useState(null);
  const [grabbed, setGrabbed] = React.useState(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(true);
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const trackRef = React.useRef(null);
  const listRefs = React.useRef(/* @__PURE__ */ new Map());
  const colRefs = React.useRef(/* @__PURE__ */ new Map());
  const cardRefs = React.useRef(/* @__PURE__ */ new Map());
  const dragRef = React.useRef(null);
  const slotRef = React.useRef(null);
  const autoScroll = React.useRef(0);
  const rafRef = React.useRef(null);
  React.useEffect(() => setCols(columns), [columns]);
  const syncEdges = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);
  React.useEffect(() => {
    syncEdges();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncEdges, cols.length]);
  const fade = "24px";
  const maskStops = [
    `transparent 0%, #000 ${atStart ? "0%" : fade}`,
    `#000 ${atEnd ? "100%" : `calc(100% - ${fade})`}, transparent 100%`,
  ].join(", ");
  const mask =
    atStart && atEnd ? void 0 : `linear-gradient(to right, ${maskStops})`;
  React.useEffect(() => {
    if (!grabbed) return;
    const el = cardRefs.current.get(grabbed);
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [cols, grabbed]);
  const commit = React.useCallback(
    (next) => {
      setCols(next);
      onChange?.(next);
    },
    [onChange],
  );
  const locate = React.useCallback((list, taskId) => {
    for (const c of list) {
      const i = c.tasks.findIndex((t) => t.id === taskId);
      if (i > -1) return { col: c.id, index: i, task: c.tasks[i] };
    }
    return null;
  }, []);
  const move = React.useCallback(
    (taskId, to) => {
      setCols((prev) => {
        const found = locate(prev, taskId);
        if (!found) return prev;
        if (found.col === to.col && found.index === to.index) return prev;
        const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
        const from = next.find((c) => c.id === found.col);
        from.tasks.splice(found.index, 1);
        const dest = next.find((c) => c.id === to.col);
        dest.tasks.splice(Math.min(to.index, dest.tasks.length), 0, found.task);
        return next;
      });
    },
    [locate, onChange],
  );
  const snapRef = React.useRef(/* @__PURE__ */ new Map());
  const snapshot = React.useCallback((taskId, fromCol) => {
    const map = /* @__PURE__ */ new Map();
    listRefs.current.forEach((list, colId) => {
      const listTop = list.getBoundingClientRect().top;
      const cards = Array.from(list.querySelectorAll("[data-kanban-card]"));
      let removed = -1;
      let removedH = 0;
      const rows = cards.map((el, i) => {
        const r = el.getBoundingClientRect();
        const isDragged = colId === fromCol && el.dataset.kanbanCard === taskId;
        if (isDragged) {
          removed = i;
          removedH = r.height;
        }
        return { top: r.top - listTop, h: r.height, isDragged };
      });
      const mids = rows
        .filter((row) => !row.isDragged)
        .map((row, i) => {
          const shift = removed > -1 && i >= removed ? removedH + GAP : 0;
          return row.top - shift + row.h / 2;
        });
      map.set(colId, mids);
    });
    snapRef.current = map;
  }, []);
  const slotAt = React.useCallback((clientX, clientY) => {
    const d = dragRef.current;
    if (!d) return null;
    let inside = "";
    let nearestId = "";
    let nearest = Infinity;
    colRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) inside = id;
      const dx = Math.abs(clientX - (r.left + r.width / 2));
      if (dx < nearest) {
        nearest = dx;
        nearestId = id;
      }
    });
    const colId = inside || nearestId;
    if (!colId) return null;
    const list = listRefs.current.get(colId);
    if (!list) return { col: colId, index: 0 };
    const listTop = list.getBoundingClientRect().top;
    const mids = snapRef.current.get(colId) ?? [];
    let index = mids.length;
    for (let i = 0; i < mids.length; i++) {
      if (clientY < listTop + mids[i]) {
        index = i;
        break;
      }
    }
    return { col: colId, index };
  }, []);
  const endDrag = React.useCallback(() => {
    const d = dragRef.current;
    const s = slotRef.current;
    if (d && s) {
      const found = locate(cols, d.taskId);
      if (found && (found.col !== s.col || found.index !== s.index)) {
        const next = cols.map((c) => ({ ...c, tasks: [...c.tasks] }));
        next.find((c) => c.id === found.col).tasks.splice(found.index, 1);
        next.find((c) => c.id === s.col).tasks.splice(s.index, 0, found.task);
        commit(next);
      }
    }
    dragRef.current = null;
    slotRef.current = null;
    autoScroll.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setDrag(null);
    setSlot(null);
  }, [cols, locate, commit]);
  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      x.set(e.clientX - d.offsetX);
      y.set(e.clientY - d.offsetY);
      const next = slotAt(e.clientX, e.clientY);
      const cur = slotRef.current;
      if (next && (!cur || cur.col !== next.col || cur.index !== next.index)) {
        slotRef.current = next;
        setSlot(next);
      }
      const track = trackRef.current;
      if (track) {
        const r = track.getBoundingClientRect();
        const edge = 72;
        autoScroll.current =
          e.clientX < r.left + edge ? -14 : e.clientX > r.right - edge ? 14 : 0;
      }
    };
    const onUp = () => endDrag();
    const onCancel = () => {
      slotRef.current = null;
      endDrag();
    };
    const onEscape2 = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onEscape2);
    window.addEventListener("pointercancel", onCancel);
    const tick = () => {
      if (autoScroll.current && trackRef.current) {
        trackRef.current.scrollLeft += autoScroll.current;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onEscape2);
      window.removeEventListener("pointercancel", onCancel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drag, endDrag, slotAt, x, y]);
  const beginDrag = (e, task, colId, index) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const state = {
      taskId: task.id,
      fromCol: colId,
      width: r.width,
      height: r.height,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
    };
    x.set(r.left);
    y.set(r.top);
    snapshot(task.id, colId);
    dragRef.current = state;
    slotRef.current = { col: colId, index };
    setDrag(state);
    setSlot({ col: colId, index });
    setGrabbed(null);
  };
  const pendingRef = React.useRef(null);
  React.useEffect(() => () => pendingRef.current?.(), []);
  const startDrag = (e, task, colId, index) => {
    if (e.button !== 0) return;
    if (readOnly) {
      onOpen?.(task);
      return;
    }
    if (grabbed) return;
    const element = e.currentTarget,
      clientX = e.clientX,
      clientY = e.clientY;
    pendingRef.current?.();
    const cleanup = () => {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", clicked);
      window.removeEventListener("pointercancel", cleanup);
      pendingRef.current = null;
    };
    const moved = (event) => {
      if (Math.hypot(event.clientX - clientX, event.clientY - clientY) < 6)
        return;
      cleanup();
      beginDrag(
        { button: 0, currentTarget: element, clientX, clientY },
        task,
        colId,
        index,
      );
      const d = dragRef.current;
      x.set(event.clientX - d.offsetX);
      y.set(event.clientY - d.offsetY);
    };
    const clicked = () => {
      cleanup();
      onOpen?.(task);
    };
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", clicked);
    window.addEventListener("pointercancel", cleanup);
    pendingRef.current = cleanup;
  };
  const originRef = React.useRef(null);
  const onCardKeyDown = (e, task) => {
    const isGrabbed = grabbed === task.id;
    if (e.key === "Enter" && !isGrabbed) {
      e.preventDefault();
      onOpen?.(task);
      return;
    }
    if (readOnly) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (isGrabbed) {
        commit(cols);
        setGrabbed(null);
        const at2 = locate(cols, task.id);
        setAnnouncement(
          at2
            ? `${task.title} d\xE9pos\xE9 dans ${colName(cols, at2.col)}, position ${at2.index + 1}.`
            : "",
        );
      } else {
        const at2 = locate(cols, task.id);
        originRef.current = cols;
        setGrabbed(task.id);
        setAnnouncement(
          `${task.title} s\xE9lectionn\xE9. Utilisez les fl\xE8ches pour d\xE9placer.`,
        );
      }
      return;
    }
    if (e.key === "Escape" && isGrabbed) {
      e.preventDefault();
      if (originRef.current) setCols(originRef.current);
      setGrabbed(null);
      setAnnouncement(`D\xE9placement annul\xE9 pour ${task.title}.`);
      return;
    }
    if (!isGrabbed) return;
    const at = locate(cols, task.id);
    if (!at) return;
    const colIndex = cols.findIndex((c) => c.id === at.col);
    let to = null;
    if (e.key === "ArrowUp")
      to = { col: at.col, index: Math.max(0, at.index - 1) };
    if (e.key === "ArrowDown")
      to = {
        col: at.col,
        index: Math.min(cols[colIndex].tasks.length - 1, at.index + 1),
      };
    if (e.key === "ArrowLeft" && colIndex > 0)
      to = {
        col: cols[colIndex - 1].id,
        index: Math.min(at.index, cols[colIndex - 1].tasks.length),
      };
    if (e.key === "ArrowRight" && colIndex < cols.length - 1)
      to = {
        col: cols[colIndex + 1].id,
        index: Math.min(at.index, cols[colIndex + 1].tasks.length),
      };
    if (to) {
      e.preventDefault();
      move(task.id, to);
      setAnnouncement(
        `${task.title} d\xE9plac\xE9 dans ${colName(cols, to.col)}, position ${to.index + 1}.`,
      );
    }
  };
  const dragged = drag ? locate(cols, drag.taskId) : null;
  return (
    <div
      ref={ref}
      style={{
        "--kanban-font": FONT_STACK,
        fontFamily: "var(--kanban-font)",
        ...style,
      }}
      className={cn(
        // a board is dragged, not read: stop drags painting text selection
        "w-full select-none text-neutral-950 antialiased dark:text-neutral-50",
        className,
      )}
      {...props}
    >
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        onScroll={syncEdges}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : void 0}
        className={cn(
          "flex items-start gap-3 overflow-x-auto pb-1",
          // the native bar is hidden; ScrollRail below draws our own
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        <LayoutGroup>
          {cols.map((col) => {
            const isTarget = slot?.col === col.id && !!drag;
            return (
              <div
                key={col.id}
                data-kanban-column={col.id}
                ref={(el) => {
                  if (el) colRefs.current.set(col.id, el);
                  else colRefs.current.delete(col.id);
                }}
                className={cn(
                  "group/col w-[286px] shrink-0 rounded-[16px] p-3 transition-colors duration-200",
                  "bg-neutral-100/70 dark:bg-white/[0.04]",
                  isTarget && "bg-neutral-200/60 dark:bg-white/[0.08]",
                  SQUIRCLE,
                )}
              >
                <ColumnHeader
                  col={col}
                  count={
                    col.tasks.length -
                    (drag && drag.fromCol === col.id ? 1 : 0) +
                    (drag && slot?.col === col.id ? 1 : 0)
                  }
                />

                <div
                  ref={(el) => {
                    if (el) listRefs.current.set(col.id, el);
                    else listRefs.current.delete(col.id);
                  }}
                  className="mt-3 flex flex-col gap-2"
                >
                  {/*
          The card in the air is taken out of the list, so the
          placeholder has to be placed against the list without
          it. Measuring in one index space and rendering in the
          other is what makes same-column reordering quietly do
          nothing.
        */}
                  {col.tasks
                    .filter((t) => t.id !== drag?.taskId)
                    .map((task, i) => {
                      return (
                        <React.Fragment key={task.id}>
                          {isTarget && slot.index === i && (
                            <Placeholder height={drag.height} />
                          )}
                          <Card
                            task={task}
                            grabbed={grabbed === task.id}
                            reduceMotion={!!reduceMotion}
                            elRef={(el) => {
                              if (el) cardRefs.current.set(task.id, el);
                              else cardRefs.current.delete(task.id);
                            }}
                            onPointerDown={(e) => startDrag(e, task, col.id, i)}
                            onKeyDown={(e) => onCardKeyDown(e, task)}
                          />
                        </React.Fragment>
                      );
                    })}
                  {isTarget &&
                    slot.index >=
                      col.tasks.filter((t) => t.id !== drag?.taskId).length && (
                      <Placeholder height={drag.height} />
                    )}
                </div>

                <button
                  type="button"
                  hidden={readOnly}
                  onClick={() => onCreate?.(col.id)}
                  className={cn(
                    "mt-2 flex w-full items-center gap-1.5 rounded-[10px] px-2 py-2 text-[12.5px] font-medium",
                    "text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-800",
                    "dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100",
                    SQUIRCLE,
                  )}
                >
                  <Plus aria-hidden className="h-3.5 w-3.5" />
                  Ajouter un élément
                </button>
              </div>
            );
          })}
        </LayoutGroup>
      </div>

      <ScrollRail trackRef={trackRef} />

      {/* the card riding the cursor */}
      <AnimatePresence>
        {drag && dragged && (
          <motion.div
            style={{ x, y, width: drag.width }}
            initial={{ scale: 1, rotate: 0 }}
            animate={{
              scale: reduceMotion ? 1 : 1.03,
              rotate: reduceMotion ? 0 : 1.6,
            }}
            exit={{ scale: 1, rotate: 0, opacity: 0 }}
            transition={LIFT_SPRING}
            className="pointer-events-none fixed left-0 top-0 z-50 origin-top-left"
          >
            <CardShell task={dragged.task} floating />
          </motion.div>
        )}
      </AnimatePresence>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
});
function colName(cols, id) {
  return cols.find((c) => c.id === id)?.name ?? id;
}
function ScrollRail({ trackRef }) {
  const railRef = React.useRef(null);
  const [geom, setGeom] = React.useState({ ratio: 1, offset: 0 });
  const [held, setHeld] = React.useState(false);
  const sync = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const ratio = el.clientWidth / el.scrollWidth;
    const max = el.scrollWidth - el.clientWidth;
    setGeom({ ratio, offset: max > 0 ? el.scrollLeft / max : 0 });
  }, [trackRef]);
  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [sync, trackRef]);
  const scrollTo = React.useCallback(
    (clientX) => {
      const rail = railRef.current;
      const el = trackRef.current;
      if (!rail || !el) return;
      const r = rail.getBoundingClientRect();
      const thumbW = r.width * geom.ratio;
      const p = (clientX - r.left - thumbW / 2) / (r.width - thumbW);
      el.scrollLeft =
        Math.max(0, Math.min(1, p)) * (el.scrollWidth - el.clientWidth);
    },
    [geom.ratio, trackRef],
  );
  React.useEffect(() => {
    if (!held) return;
    const onMove = (e) => scrollTo(e.clientX);
    const onUp = () => setHeld(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onEscape);
    };
  }, [held, scrollTo]);
  if (geom.ratio >= 0.999) return null;
  return (
    <div
      ref={railRef}
      onPointerDown={(e) => {
        setHeld(true);
        scrollTo(e.clientX);
      }}
      className="mt-3 h-[6px] w-full cursor-pointer rounded-full bg-black/[0.05] dark:bg-white/[0.07]"
    >
      <div
        style={{
          width: `${geom.ratio * 100}%`,
          marginLeft: `${geom.offset * (100 - geom.ratio * 100)}%`,
        }}
        className={cn(
          "h-full rounded-full transition-colors",
          held
            ? "bg-black/40 dark:bg-white/50"
            : "bg-black/20 hover:bg-black/30 dark:bg-white/25 dark:hover:bg-white/40",
        )}
      />
    </div>
  );
}
function ColumnHeader({ col, count }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          ACCENT_DOT[col.accent ?? "slate"],
        )}
      />
      <h3 className="m-0 truncate text-[13px] font-medium tracking-[-0.005em]">
        {col.name}
      </h3>
      <motion.span
        key={count}
        initial={{ y: -6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={FLOW_SPRING}
        className={cn(
          "grid h-[18px] min-w-[18px] place-items-center rounded-[6px] px-1 text-[11px] font-medium tabular-nums",
          "bg-black/[0.06] text-neutral-500 dark:bg-white/[0.09] dark:text-neutral-400",
          SQUIRCLE,
        )}
      >
        {count}
      </motion.span>
    </div>
  );
}
function IconButton({ label, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        // always there, quiet until you reach for it
        "grid h-6 w-6 place-items-center rounded-[7px] transition-colors duration-150",
        "text-neutral-400 hover:bg-black/[0.06] hover:text-neutral-800 active:bg-black/[0.1]",
        "dark:text-neutral-500 dark:hover:bg-white/[0.1] dark:hover:text-neutral-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30",
        SQUIRCLE,
      )}
    >
      {children}
    </button>
  );
}
function Placeholder({ height }) {
  return (
    <motion.div
      layout
      data-kanban-placeholder
      initial={{ opacity: 0, scaleY: 0.7 }}
      animate={{ opacity: 1, scaleY: 1 }}
      exit={{ opacity: 0, scaleY: 0.7 }}
      transition={FLOW_SPRING}
      style={{ height }}
      className={cn(
        "origin-top rounded-[12px] border border-dashed",
        "border-neutral-300 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]",
        SQUIRCLE,
      )}
    />
  );
}
function Card({
  task,
  grabbed,
  reduceMotion,
  elRef,
  onPointerDown,
  onKeyDown,
}) {
  return (
    <motion.div
      ref={elRef}
      layout
      data-kanban-card={task.id}
      tabIndex={0}
      role="button"
      aria-roledescription="Carte déplaçable"
      aria-grabbed={grabbed}
      aria-label={`${task.title}. Entr\xE9e pour ouvrir, Espace puis les fl\xE8ches pour d\xE9placer.`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      transition={reduceMotion ? { duration: 0 } : FLOW_SPRING}
      whileHover={reduceMotion ? void 0 : { y: -1 }}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30",
        grabbed && "ring-2 ring-neutral-900/40 dark:ring-white/50",
        "rounded-[12px]",
        SQUIRCLE,
      )}
    >
      <CardShell task={task} />
    </motion.div>
  );
}
function CardShell({ task, floating }) {
  return (
    <div
      className={cn(
        "rounded-[12px] border p-3",
        "border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-neutral-900",
        floating
          ? "shadow-[0_16px_32px_-12px_rgb(0_0_0/0.28)]"
          : "shadow-[0_1px_2px_rgb(0_0_0/0.05)]",
        SQUIRCLE,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {task.priority && (
          <span
            className={cn(
              CHIP,
              "font-medium",
              PRIORITY_STYLES[task.priority],
              SQUIRCLE,
            )}
          >
            <Flag aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            <span>{PRIORITY_LABELS[task.priority]}</span>
          </span>
        )}
        {task.category && (
          <span
            className={cn(
              CHIP,
              "font-normal",
              "bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300",
              SQUIRCLE,
            )}
          >
            <TaskIcon icon={task.icon} />
            <span>{task.category}</span>
          </span>
        )}
      </div>

      <p className="m-0 mt-2.5 text-[14px] font-medium leading-snug tracking-[-0.005em]">
        {task.title}
      </p>

      {task.note && (
        <p className="m-0 mt-1 text-[12px] font-normal leading-snug text-neutral-500 dark:text-neutral-400">
          {task.note}
        </p>
      )}

      {(task.assignees?.length || task.due || task.progress != null) && (
        <>
          <div className="mt-3 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {task.due && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11.5px] font-normal tabular-nums",
                    task.dueSoon
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-neutral-500 dark:text-neutral-400",
                  )}
                >
                  <CalendarDays
                    aria-hidden
                    className="h-3 w-3 shrink-0"
                    strokeWidth={2.25}
                  />
                  {task.due}
                </span>
              )}
              {task.progress != null && <ProgressRing value={task.progress} />}
            </div>
            <AvatarStack people={task.assignees ?? []} />
          </div>
        </>
      )}
    </div>
  );
}
function Tooltip({ label, children }) {
  const skin = "bg-neutral-900 dark:bg-neutral-100";
  return (
    <span className="group/tip relative flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2",
          "translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out",
          "group-hover/tip:translate-y-0 group-hover/tip:opacity-100",
          "group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100",
        )}
      >
        <span
          className={cn(
            "block whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] font-medium leading-none",
            "text-white dark:text-neutral-900",
            skin,
            "shadow-[0_6px_16px_-4px_rgb(0_0_0/0.3)]",
            SQUIRCLE,
          )}
        >
          {label}
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 top-full h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1.5px]",
            skin,
          )}
        />
      </span>
    </span>
  );
}
function AvatarStack({ people }) {
  const shown = people.slice(0, 3);
  const rest = people.slice(3);
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.name + i} className={cn(i > 0 && "-ml-1.5")}>
          <Tooltip label={p.name}>
            <span
              tabIndex={0}
              aria-label={p.name}
              className={cn(
                "grid h-[22px] w-[22px] place-items-center overflow-hidden rounded-full",
                "ring-2 ring-white dark:ring-neutral-900",
                "focus-visible:outline-none focus-visible:ring-neutral-900 dark:focus-visible:ring-white",
              )}
            >
              {p.avatar ? (
                <img
                  src={p.avatar}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Initials name={p.name} />
              )}
            </span>
          </Tooltip>
        </span>
      ))}
      {rest.length > 0 && (
        <span className="-ml-1.5">
          <Tooltip label={rest.map((p) => p.name).join(", ")}>
            <span
              tabIndex={0}
              className={cn(
                "grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-medium",
                "bg-neutral-200 text-neutral-600 ring-2 ring-white",
                "dark:bg-white/15 dark:text-neutral-200 dark:ring-neutral-900",
                "focus-visible:outline-none focus-visible:ring-neutral-900 dark:focus-visible:ring-white",
              )}
            >
              +{rest.length}
            </span>
          </Tooltip>
        </span>
      )}
    </div>
  );
}
const INITIAL_TINTS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
];
function Initials({ name }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "grid h-full w-full place-items-center text-[9.5px] font-medium text-white",
        INITIAL_TINTS[h % INITIAL_TINTS.length],
      )}
    >
      {initials}
    </span>
  );
}
function ProgressRing({ value }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 6;
  const c = 2 * Math.PI * r;
  const done = v >= 100;
  return (
    <span className="inline-flex items-center gap-1">
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="h-[14px] w-[14px] -rotate-90"
      >
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2"
          className="stroke-black/[0.09] dark:stroke-white/15"
        />
        <motion.circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={FLOW_SPRING}
          className={
            done
              ? "stroke-emerald-500"
              : "stroke-neutral-900 dark:stroke-neutral-100"
          }
        />
      </svg>
      <span className="text-[11.5px] font-normal tabular-nums text-neutral-500 dark:text-neutral-400">
        {v}%
      </span>
    </span>
  );
}
const CATEGORY_ICONS = {
  web: { Icon: Monitor, tint: "text-blue-500" },
  dashboard: { Icon: LayoutDashboard, tint: "text-emerald-500" },
  mobile: { Icon: Smartphone, tint: "text-violet-500" },
  brand: { Icon: Palette, tint: "text-rose-500" },
  infra: { Icon: Server, tint: "text-amber-500" },
  docs: { Icon: FileText, tint: "text-teal-500" },
};
function TaskIcon({ icon }) {
  if (icon && typeof icon !== "string") return <>{icon}</>;
  const { Icon, tint } = CATEGORY_ICONS[icon ?? "web"] ?? CATEGORY_ICONS.web;
  return (
    <Icon
      aria-hidden
      className={cn("h-3 w-3 shrink-0", tint)}
      strokeWidth={2.25}
    />
  );
}
var stdin_default = KanbanBoard;
export { KanbanBoard as Component, KanbanBoard, stdin_default as default };
