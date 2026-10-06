import { Paperclip } from "lucide-react";
import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import {
  CheckCheck,
  LayoutGrid,
  Link2,
  ChevronDown,
  ArrowRight,
} from "../icons";
import {
  plainNoteDocument,
  noteDocumentText,
} from "../../shared/note-document";
const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      workspace_id: { default: null },
      item_id: { default: null },
      label: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-note-mention]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-note-mention": "true",
        class: "note-mention",
        role: "link",
        tabindex: "0",
      }),
      "@" + node.attrs.label,
    ];
  },
});
const commands = [
  ["demande", "Préparer une demande", "demand"],
  ["feature", "Préparer une feature", "feature"],
  ["tâche", "Préparer une tâche", "task"],
  ["décision", "Consigner une décision", "decision"],
  ["checklist", "Liste à cocher", "checklist"],
  ["tableau", "Insérer un tableau", "table"],
  ["joindre", "Image ou PDF", "attach"],
];
const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export default function RichNoteEditor({
  text,
  document,
  catalog = [],
  onCommand,
  onReference,
  onChange,
  onSave,
  onFiles,
  toolbarTarget,
  readOnly = false,
  autoFocus = false,
  label = "Texte de la note",
}) {
  const [menu, setMenu] = useState(null),
    [menuIndex, setMenuIndex] = useState(0);
  const menuRef = useRef(null),
    dismissed = useRef(null),
    editorRef = useRef(null),
    fileInput = useRef(null);
  const callbacks = useRef({
    onChange,
    onSave,
    onFiles,
    onCommand,
    onReference,
  });
  const container = useRef(null);
  const toolbar = useRef(null);
  callbacks.current = { onChange, onSave, onFiles, onCommand, onReference };
  const editor = useEditor({
    extensions: [
      Mention,
      StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: {
          checkboxLabel: (node) =>
            "Cocher : " + (node.textContent || "Nouvelle tâche"),
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: document || plainNoteDocument(text),
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
        "data-placeholder": "Écrivez librement. @ pour relier, / pour agir.",
      },
      handleClick: (_view, _pos, e) => {
        const mention = e.target.closest?.("[data-note-mention]");
        if (mention) {
          callbacks.current.onReference?.({
            workspace_id: mention.getAttribute("workspace_id"),
            item_id: mention.getAttribute("item_id"),
          });
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, e) => {
        const current = menuRef.current;
        if (current && !e.isComposing) {
          if (e.key === "Escape") {
            e.preventDefault();
            dismissed.current = current.trigger;
            setMenu(null);
            return true;
          }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setMenuIndex(
              (i) =>
                (i +
                  (e.key === "ArrowDown" ? 1 : -1) +
                  Math.max(1, current.options.length)) %
                Math.max(1, current.options.length),
            );
            return true;
          }
          if (e.key === "Enter" && current.options.length) {
            e.preventDefault();
            current.choose(
              current.options[current.index] || current.options[0],
            );
            return true;
          }
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
          e.preventDefault();
          callbacks.current.onSave?.();
          return true;
        }
        return false;
      },
      handlePaste: (_view, e) => {
        const images = Array.from(e.clipboardData?.files || []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (images.length && callbacks.current.onFiles) {
          e.preventDefault();
          callbacks.current.onFiles(images);
          return true;
        }
        return false;
      },
      handleDrop: (_view, e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length && callbacks.current.onFiles) {
          e.preventDefault();
          callbacks.current.onFiles(files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON();
      callbacks.current.onChange?.({
        text: noteDocumentText(doc),
        document: doc,
      });
    },
  });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable !== !readOnly) editor.setEditable(!readOnly, false);
    const next = document || plainNoteDocument(text);
    if (JSON.stringify(next) !== JSON.stringify(editor.getJSON()))
      editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, text, document, readOnly]);
  editorRef.current = editor;
  function detectMenu() {
    if (
      !editor ||
      readOnly ||
      editor.state.selection.from !== editor.state.selection.to
    ) {
      setMenu(null);
      return;
    }
    const pos = editor.state.selection.$from;
    const before = pos.parent.textBetween(0, pos.parentOffset, "", " ");
    const match =
      before.match(/(?:^|\s)@([^@\n]{0,80})$/) ||
      before.match(/(?:^|\s)\/([^/\s]{0,30})$/);
    if (!match) {
      dismissed.current = null;
      setMenu(null);
      return;
    }
    const kind = /(?:^|\s)\/[^/\s]*$/.test(before) ? "command" : "mention";
    const trigger = kind + ":" + before;
    if (dismissed.current === trigger) return;
    const from = pos.pos - match[1].length - 1;
    setMenu((previous) =>
      previous?.trigger === trigger
        ? previous
        : { kind, query: match[1], from, to: pos.pos, trigger },
    );
    setMenuIndex(0);
  }
  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", detectMenu);
    editor.on("update", detectMenu);
    return () => {
      editor.off("selectionUpdate", detectMenu);
      editor.off("update", detectMenu);
    };
  }, [editor, readOnly]);
  const options =
    menu?.kind === "command"
      ? commands
          .filter((c) => normalize(c[0]).includes(normalize(menu.query)))
          .map((c) => ({ label: c[0], subtitle: c[1], command: c[2] }))
      : menu
        ? catalog
            .flatMap((w) => [
              { label: w.name, workspace_id: w.id, subtitle: "Workspace" },
              ...(w.items || []).map((i) => ({
                label: i.title,
                workspace_id: w.id,
                item_id: i.id,
                subtitle:
                  w.name +
                  " · " +
                  ({
                    initiative: "Initiative",
                    project: "Projet",
                    feature: "Feature",
                    task: "Tâche",
                  }[i.type] || "Élément"),
              })),
            ])
            .filter((o) =>
              normalize(o.label + " " + o.subtitle).includes(
                normalize(menu.query),
              ),
            )
            .slice(0, 12)
        : [];
  function choose(option) {
    if (!editor || !menu) return;
    const range = { from: menu.from, to: menu.to };
    dismissed.current = menu.trigger;
    setMenu(null);
    if (option.workspace_id) {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mention",
            attrs: {
              workspace_id: option.workspace_id,
              item_id: option.item_id || null,
              label: option.label,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
      return;
    }
    editor.chain().focus().deleteRange(range).run();
    if (option.command === "checklist")
      editor.chain().focus().toggleTaskList().run();
    else if (option.command === "table")
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    else if (option.command === "attach") fileInput.current?.click();
    else if (option.command === "decision")
      editor.chain().focus().insertContent("Décision : ").run();
    else
      callbacks.current.onCommand?.(option.command, {
        text: noteDocumentText(editor.getJSON()),
        document: editor.getJSON(),
      });
  }
  menuRef.current = menu
    ? { ...menu, options, index: menuIndex, choose }
    : null;
  const [compactToolsOpen, setCompactToolsOpen] = useState(false);
  if (!editor) return null;
  const action = (run) => {
    if (editor.isDestroyed) return;
    run(editor.chain().focus());
    toolbar.current
      ?.querySelectorAll("details[open]")
      .forEach((menu) => menu.removeAttribute("open"));
  };
  const placeToolbar = (content) =>
    toolbarTarget ? createPortal(content, toolbarTarget) : content;
  return (
    <div className="rich-note-editor" ref={container}>
      {!readOnly &&
        placeToolbar(
          <div className={`note-tools-group ${compactToolsOpen ? 'is-open' : ''}`} onKeyDown={e=>{if(e.key==='Escape')setCompactToolsOpen(false);}}>
          <button className="note-tools-toggle" type="button" aria-label="Mise en forme et pièces jointes" aria-expanded={compactToolsOpen} onClick={()=>setCompactToolsOpen(!compactToolsOpen)}>Aa <span aria-hidden="true">⌄</span></button>
          <div
            ref={toolbar}
            className="note-editor-toolbar"
            role="toolbar"
            aria-label="Mise en forme de la note"
          >
            <details className="note-format-menu">
              <summary aria-label="Style du texte">
                <span>Aa</span>
                <ChevronDown size={12} />
              </summary>
              <div>
                <button
                  type="button"
                  onClick={() => action((c) => c.setParagraph().run())}
                >
                  Texte
                </button>
                <button
                  type="button"
                  onClick={() =>
                    action((c) => c.toggleHeading({ level: 1 }).run())
                  }
                >
                  Titre
                </button>
                <button
                  type="button"
                  onClick={() =>
                    action((c) => c.toggleHeading({ level: 2 }).run())
                  }
                >
                  Sous-titre
                </button>
                {[
                  ["Gras", "bold", "toggleBold"],
                  ["Italique", "italic", "toggleItalic"],
                  ["Souligné", "underline", "toggleUnderline"],
                  ["Barré", "strike", "toggleStrike"],
                ].map(([name, mark, command]) => (
                  <button
                    key={mark}
                    type="button"
                    aria-pressed={editor.isActive(mark)}
                    onClick={() => action((c) => c[command]().run())}
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => action((c) => c.toggleBulletList().run())}
                >
                  Liste à puces
                </button>
                <button
                  type="button"
                  aria-pressed={editor.isActive("highlight")}
                  onClick={() => action((c) => c.toggleHighlight().run())}
                >
                  Surligner
                </button>
                <button
                  type="button"
                  onClick={() => action((c) => c.toggleOrderedList().run())}
                >
                  Liste numérotée
                </button>
              </div>
            </details>
            <button
              type="button"
              title="Liste à cocher"
              aria-label="Liste à cocher"
              aria-pressed={editor.isActive("taskList")}
              onClick={() => action((c) => c.toggleTaskList().run())}
            >
              <CheckCheck size={18} />
            </button>
            <details className="note-format-menu">
              <summary aria-label="Tableau">
                <LayoutGrid size={18} />
              </summary>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    action((c) =>
                      c
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run(),
                    )
                  }
                >
                  Insérer un tableau
                </button>
                {editor.isActive("table") && (
                  <>
                    {[
                      ["Ajouter une ligne", "addRowAfter"],
                      ["Ajouter une colonne", "addColumnAfter"],
                      ["Supprimer la ligne", "deleteRow"],
                      ["Supprimer la colonne", "deleteColumn"],
                      ["Supprimer le tableau", "deleteTable"],
                    ].map(([name, command]) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => action((c) => c[command]().run())}
                      >
                        {name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </details>
            {onFiles && (
              <label
                className="note-toolbar-attach"
                title="Ajouter une image ou un PDF"
              >
                <Paperclip size={18} />
                <input
                  aria-label="Ajouter une image ou un PDF"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => {
                    callbacks.current.onFiles?.(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <span className="note-toolbar-separator" />
            <button
              type="button"
              aria-label="Annuler"
              title="Annuler · ⌘Z"
              disabled={editor.isDestroyed || !editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Rétablir"
              title="Rétablir · ⌘⇧Z"
              disabled={editor.isDestroyed || !editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <ArrowRight size={16} />
            </button>
          </div></div>,
        )}
      <EditorContent editor={editor} />
      {!readOnly && (
        <input
          ref={fileInput}
          className="note-command-file"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => {
            callbacks.current.onFiles?.(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      )}
      {menu &&
        createPortal(
          <div
            className="note-command-menu"
            style={(() => {
              const point = editor.view.coordsAtPos(menu.to);
              return {
                position: "fixed",
                top: Math.max(
                  8,
                  Math.min(point.bottom + 8, window.innerHeight - 330),
                ),
                left: Math.max(
                  8,
                  Math.min(point.left, window.innerWidth - 340),
                ),
                width: Math.min(320, window.innerWidth - 16),
                zIndex: 10000,
              };
            })()}
            role="listbox"
            aria-label={
              menu.kind === "mention"
                ? "Relier une information"
                : "Actions de la note"
            }
          >
            <small>
              {menu.kind === "mention"
                ? "Relier une information"
                : "Actions de la note"}
            </small>
            {options.map((option, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === menuIndex}
                className={i === menuIndex ? "active" : ""}
                key={
                  (option.workspace_id || option.command) +
                  ":" +
                  (option.item_id || "")
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                <strong>
                  {menu.kind === "command" ? "/" : ""}
                  {option.label}
                </strong>
                <span>{option.subtitle}</span>
              </button>
            ))}
            {!options.length && <p>Aucun résultat</p>}
            <small>
              ↑ ↓ pour choisir · Entrée pour valider · Échap pour fermer
            </small>
          </div>,
          window.document.body,
        )}
    </div>
  );
}
