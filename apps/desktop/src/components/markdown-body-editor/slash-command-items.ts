import type { Editor, Range } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Type,
} from "lucide-react";

export type SlashCommandKey =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "table"
  | "divider";

export interface SlashCommandItem {
  // i18n key suffix under notes:slash.items.* (shared by all Markdown bodies).
  key: SlashCommandKey;
  icon: LucideIcon;
  // Lowercased terms used to match the typed query.
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

// The full slash-command palette. Each `run` first deletes the typed "/query"
// range, then applies the block transform.
export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    key: "paragraph",
    icon: Type,
    keywords: ["paragraph", "text", "plain"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    key: "heading1",
    icon: Heading1,
    keywords: ["heading", "title", "h1"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    key: "heading2",
    icon: Heading2,
    keywords: ["heading", "subtitle", "h2"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    key: "heading3",
    icon: Heading3,
    keywords: ["heading", "h3"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    key: "bulletList",
    icon: List,
    keywords: ["bullet", "list", "unordered"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    key: "orderedList",
    icon: ListOrdered,
    keywords: ["ordered", "numbered", "list"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    key: "taskList",
    icon: CheckSquare,
    keywords: ["task", "todo", "checkbox", "checklist"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    key: "blockquote",
    icon: Quote,
    keywords: ["quote", "blockquote", "citation"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    key: "codeBlock",
    icon: Code,
    keywords: ["code", "codeblock", "snippet"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    key: "table",
    icon: Table,
    keywords: ["table", "grid", "columns", "rows"],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    key: "divider",
    icon: Minus,
    keywords: ["divider", "rule", "separator", "hr"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

const ASCII_QUERY = /^[\x20-\x7e]+$/u;

function matchesLabel(label: string, query: string): boolean {
  const normalized = label.toLowerCase();
  if (!ASCII_QUERY.test(query)) {
    return normalized.includes(query);
  }
  return normalized.split(/[\s_-]+/u).some((word) => word.startsWith(query));
}

export function filterSlashCommandItems(
  query: string,
  items: SlashCommandItem[] = SLASH_COMMAND_ITEMS,
  labelOf: (item: SlashCommandItem) => string = () => "",
): SlashCommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter(
    (item) =>
      item.key.toLowerCase().startsWith(normalized) ||
      item.keywords.some((keyword) => keyword.startsWith(normalized)) ||
      matchesLabel(labelOf(item), normalized),
  );
}
