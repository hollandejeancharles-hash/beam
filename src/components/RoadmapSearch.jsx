import React, { useMemo } from "react";
import CommandPalette from "./ui/command-palette";
import {
  Planning,
  Integration,
  LayoutGrid,
  MessageSquare,
  Radio,
  Search,
  SlidersHorizontal,
} from "../icons";
import { TYPES } from "../../shared/planning";
const states = { planned: "À venir", progress: "En cours", done: "Livré" },
  priority = { high: "Haute", medium: "Normale", low: "Basse" };
export default function RoadmapSearch({ items, publicMode, onApply, onClose }) {
  const commands = useMemo(() => {
    const nav = [
      ["gantt", "Planification", Planning],
      ["kanban", "Kanban", LayoutGrid],
      ...(!publicMode
        ? [
            ["feedback", "Suggestions", MessageSquare],
            ["changelog", "Nouveautés", Radio],
            ["integrations", "Intégrations", Integration],
            ["notes", "Notes", MessageSquare],
          ]
        : []),
    ];
    const filter = (id, label, options, kind = "plain") => ({
      id: "filter:" + id,
      label,
      icon: <SlidersHorizontal size={16} />,
      slots: [
        {
          name: label,
          prompt: "Choisir " + label.toLowerCase(),
          kind,
          options,
        },
      ],
      message: (values) => label + " : " + values[0].value,
    });
    return [
      ...nav.map(([id, label, Icon]) => ({
        id: "nav:" + id,
        label: "Aller à " + label,
        icon: <Icon size={16} />,
        slots: [],
        immediate: true,
        message: () => label,
      })),
      filter(
        "type",
        "Type de suivi",
        Object.entries(TYPES).map(([id, value]) => ({ id, value })),
      ),
      filter(
        "status",
        "État",
        Object.entries(states).map(([id, value]) => ({
          id,
          value,
          dot: { planned: "#969db3", progress: "#d9b76a", done: "#83b79b" }[id],
        })),
        "dot",
      ),
      filter(
        "priority",
        "Priorité",
        Object.entries(priority).map(([id, value]) => ({
          id,
          value,
          dot: { high: "#d192a0", medium: "#a1a5c0", low: "#8b9b97" }[id],
        })),
        "dot",
      ),
      {
        id: "reset",
        label: "Réinitialiser les filtres",
        icon: <SlidersHorizontal size={16} />,
        slots: [],
        immediate: true,
        message: () => "",
      },
      ...items.map((item) => ({
        id: "open:" + item.id,
        label: item.title,
        icon: <Search size={16} />,
        hint: TYPES[item.type || "feature"],
        slots: [],
        immediate: true,
        message: () => item.title,
      })),
    ];
  }, [items, publicMode]);
  return (
    <CommandPalette commands={commands} onApply={onApply} onDismiss={onClose} />
  );
}
