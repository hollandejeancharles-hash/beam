const TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);
const MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
]);
const BLOCKS = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "table",
  "blockquote",
  "codeBlock",
  "horizontalRule",
];
const CHILDREN = {
  doc: BLOCKS,
  blockquote: BLOCKS,
  listItem: BLOCKS,
  taskItem: BLOCKS,
  paragraph: ["text", "hardBreak"],
  heading: ["text", "hardBreak"],
  codeBlock: ["text"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  taskList: ["taskItem"],
  table: ["tableRow"],
  tableRow: ["tableCell", "tableHeader"],
  tableCell: BLOCKS,
  tableHeader: BLOCKS,
  text: [],
  hardBreak: [],
  horizontalRule: [],
};
export function validateNoteDocument(input) {
  if (!input || input.type !== "doc" || JSON.stringify(input).length > 100000)
    throw Error("Document de note invalide");
  let count = 0;
  function visit(node, depth = 0) {
    if (++count > 2000 || depth > 16 || !node || !TYPES.has(node.type))
      throw Error("Document de note invalide");
    const out = { type: node.type };
    if (node.type === "text") {
      if (typeof node.text !== "string") throw Error("Texte invalide");
      out.text = node.text;
      if (node.marks) {
        if (
          !Array.isArray(node.marks) ||
          node.marks.some((m) => !MARKS.has(m.type))
        )
          throw Error("Mise en forme invalide");
        out.marks = node.marks.map((m) => ({ type: m.type }));
      }
    }
    if (node.type === "heading")
      out.attrs = {
        level: [1, 2, 3].includes(node.attrs?.level) ? node.attrs.level : 2,
      };
    if (node.type === "taskItem")
      out.attrs = { checked: node.attrs?.checked === true };
    if (node.type === "orderedList")
      out.attrs = {
        start:
          Number.isInteger(node.attrs?.start) &&
          node.attrs.start > 0 &&
          node.attrs.start < 10000
            ? node.attrs.start
            : 1,
      };
    if (["tableCell", "tableHeader"].includes(node.type))
      out.attrs = { colspan: 1, rowspan: 1, colwidth: null };
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw Error("Contenu invalide");
      if (node.content.some((n) => !CHILDREN[node.type].includes(n?.type)))
        throw Error("Structure de note invalide");
      out.content = node.content.map((n) => visit(n, depth + 1));
    }
    return out;
  }
  const result = visit(input);
  if (noteDocumentText(result).length > 5000)
    throw Error("Une note peut contenir au maximum 5 000 caractères.");
  return result;
}
export function noteDocumentText(node) {
  if (node.type === "text") return node.text;
  if (node.type === "hardBreak") return "\n";
  const children = (node.content || []).map(noteDocumentText);
  if (node.type === "taskItem")
    return (node.attrs?.checked ? "[x] " : "[ ] ") + children.join("\n");
  return children
    .join(
      ["paragraph", "heading", "tableCell", "tableHeader"].includes(node.type)
        ? ""
        : node.type === "tableRow"
          ? " | "
          : "\n",
    )
    .trim();
}
export function plainNoteDocument(text = "") {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}
