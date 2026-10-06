import QuickItemActions from "./QuickItemActions";
import AIProgress from "./AIProgress";
import React, { useMemo } from "react";
import { KanbanBoard } from "./ui/kanban-board";
import { Planning } from "../icons";
import { TYPES } from "../../shared/planning";

const states = [
  { id: "planned", name: "À venir", accent: "slate" },
  { id: "progress", name: "En cours", accent: "violet" },
  { id: "done", name: "Livré", accent: "emerald" },
];
export default function BeamKanban({
  items,
  sort,
  readOnly,
  onChange,
  onOpen,
  onQuickChange,
  onCreateChild,
  onCreate,
}) {
  const signature = JSON.stringify(items);
  const columns = useMemo(
    () =>
      states.map((state) => ({
        ...state,
        tasks: items
          .filter((item) => item.status === state.id)
          .sort((a, b) =>
            sort === "manual"
              ? (a.kanban_position || 0) - (b.kanban_position || 0)
              : 0,
          )
          .map((item) => ({
            id: item.id,
            title: item.title,
            accessory: (
              <><AIProgress itemId={item.id} scope="feature" size={16} />{!readOnly && <QuickItemActions item={item} onChange={onQuickChange} onCreate={item.type === "task" ? undefined : onCreateChild}/>}</>
            ),
            note: TYPES[item.type || "feature"] || "Feature",
            category: item.category,
            priority: item.priority === "medium" ? "normal" : item.priority,
            icon: <Planning size={12} />,
            assignees: item.owner ? [{ name: item.owner }] : [],
            due: item.end_date
              ? new Intl.DateTimeFormat("fr-FR", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(item.end_date + "T12:00:00"))
              : undefined,
            dueSoon:
              item.status !== "done" &&
              item.end_date &&
              item.end_date < new Date().toISOString().slice(0, 10),
            progress: item.status === "done" ? 100 : item.progress || 0,
          })),
      })),
    [signature, sort, readOnly, onQuickChange, onCreateChild],
  );
  return (
    <div className="beam-kanban dark" data-readonly={readOnly}>
      <p className="kanban-guidance">
        {readOnly
          ? "Ouvrez un élément pour consulter son détail."
          : "Glissez les cartes pour changer leur état ou leur ordre."}
      </p>
      <KanbanBoard
        columns={columns}
        readOnly={readOnly}
        onCreate={onCreate}
        onOpen={(task) => onOpen(items.find((item) => item.id === task.id))}
        onChange={(next) =>
          onChange(
            next.map((column) => ({
              id: column.id,
              ids: column.tasks.map((task) => task.id),
            })),
          )
        }
      />
    </div>
  );
}
