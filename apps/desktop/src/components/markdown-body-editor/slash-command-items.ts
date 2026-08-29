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
    key: "divider",
    icon: Minus,
    keywords: ["divider", "rule", "separator", "hr"],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

// Pure filter so it can be unit-tested without an editor. Matches the query
// against each item's key and keywords (case-insensitive, substring).
export function filterSlashCommandItems(
  query: string,
  items: SlashCommandItem[] = SLASH_COMMAND_ITEMS,
): SlashCommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter(
    (item) =>
      item.key.toLowerCase().includes(normalized) ||
      item.keywords.some((keyword) => keyword.includes(normalized)),
  );
}
