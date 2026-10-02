import React, { useEffect, useRef, useState, useMemo } from "react";
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
import { buildSearchRecords } from "../../shared/search";
import { TYPES } from "../../shared/planning";
const states = { planned: "À venir", progress: "En cours", done: "Livré" },
  priority = { high: "Haute", medium: "Normale", low: "Basse" };
export default function RoadmapSearch({
  items,
  publicMode,
  pagesMode,
  api,
  categories = [],
  onApply,
  onClose,
}) {
  const [records, setRecords] = useState(() =>
      buildSearchRecords({ items }, publicMode),
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (publicMode) {
          const publications = pagesMode
            ? await fetch(import.meta.env.BASE_URL + "publications.json").then(
                (r) => {
                  if (!r.ok) throw Error("Publications indisponibles");
                  return r.json();
                },
              )
            : await apiRef.current("public/publications");
          if (alive)
            setRecords(buildSearchRecords({ items, publications }, true));
        } else {
          const index = await apiRef.current("admin/search");
          if (alive) setRecords(index);
        }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [publicMode, pagesMode]);
  const commands = useMemo(() => {
    const nav = [
      ["gantt", "Planification", Planning],
      ["kanban", "Kanban", LayoutGrid],
      ["publications", publicMode ? "Nouveautés" : "Publications", Radio],
      ...(!publicMode
        ? [
            ["feedback", "Suggestions", MessageSquare],
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
      ...(!publicMode
        ? [
            {
              id: "action:create",
              label: "Créer un élément",
              searchText: "nouvelle initiative projet feature ajouter",
              icon: <Planning size={16} />,
              slots: [
                {
                  name: "Type",
                  prompt: "Choisir le type",
                  kind: "plain",
                  options: Object.entries(TYPES).map(([id, value]) => ({
                    id,
                    value,
                  })),
                },
              ],
              message: (v) => "Créer " + v[0].value,
            },
            ...[
              [
                "capture",
                "Noter rapidement",
                "note échange capture",
                MessageSquare,
              ],
              [
                "profile",
                "Mon profil",
                "photo avatar compte utilisateur",
                Search,
              ],
              ["share", "Partager la roadmap", "portail public lien", Radio],
              [
                "ai",
                "Assistant local",
                "IA intelligence artificielle ollama modèle",
                Search,
              ],
              [
                "archives",
                "Voir les archives de planification",
                "éléments archivés gantt",
                Planning,
              ],
            ].map(([id, label, searchText, Icon]) => ({
              id: "action:" + id,
              label,
              searchText,
              icon: <Icon size={16} />,
              slots: [],
              immediate: true,
              message: () => label,
            })),
          ]
        : []),
      filter(
        "category",
        "Catégorie",
        [...new Set([...categories, ...items.map((i) => i.category)])]
          .sort()
          .map((value) => ({ id: value, value })),
      ),
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
      ...records.map((record) => ({
        id: "result:" + record.kind + ":" + record.id,
        label: record.title,
        searchText: record.body,
        hint: record.hint + (record.archived ? " · Archive" : ""),
        icon: <Search size={16} />,
        slots: [],
        immediate: true,
        message: () => record.title,
        target: record,
      })),
    ];
  }, [items, publicMode, records, categories]);
  return (
    <>
      <p className="search-index-status" role="status">
        {loading
          ? "Chargement de la recherche…"
          : error
            ? "Recherche partielle : " + error
            : publicMode
              ? "Roadmap et publications publiques"
              : "Éléments, notes, documents, sujets, informations importées et publications"}
      </p>
      <CommandPalette
        commands={commands}
        onApply={onApply}
        onDismiss={onClose}
      />
    </>
  );
}
