import { createPortal } from "react-dom";
import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
export default function RichNoteEditor({
  text,
  document,
  onChange,
  onSave,
  onFiles,
  toolbarTarget,
  readOnly = false,
  autoFocus = false,
  label = "Texte de la note",
}) {
  const callbacks = useRef({ onChange, onSave, onFiles });
  const container = useRef(null);
  const toolbar = useRef(null);
  callbacks.current = { onChange, onSave, onFiles };
  const editor = useEditor({
    extensions: [
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
        "data-placeholder": "Une idée, un échange, une suite à donner…",
      },
      handleKeyDown: (_view, e) => {
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
                <Link2 size={18} />
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
          </div>,
        )}
      <EditorContent editor={editor} />
    </div>
  );
}
