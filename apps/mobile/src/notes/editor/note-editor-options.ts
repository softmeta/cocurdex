import { PixelRatio } from "react-native";
import type { ThemeColors } from "@/theme";
import type { NoteBlockStyle, NoteInsertKind } from "./note-editor-protocol";

export const BLOCK_STYLES: readonly NoteBlockStyle[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "blockquote",
  "codeBlock",
];

export type InsertChoice =
  | { name: "block"; style: NoteBlockStyle }
  | { name: "insert"; kind: NoteInsertKind };

export const INSERT_CHOICES: readonly InsertChoice[] = [
  { name: "block", style: "heading1" },
  { name: "block", style: "heading2" },
  { name: "block", style: "heading3" },
  { name: "insert", kind: "bulletList" },
  { name: "insert", kind: "orderedList" },
  { name: "insert", kind: "taskList" },
  { name: "block", style: "blockquote" },
  { name: "block", style: "codeBlock" },
  { name: "insert", kind: "diagram" },
  { name: "insert", kind: "formula" },
  { name: "insert", kind: "horizontalRule" },
  { name: "insert", kind: "table" },
];

export function editorTheme(colors: ThemeColors, textScale: number) {
  return {
    colors: {
      background: colors.background,
      foreground: colors.foreground,
      "reading-text": colors.readingText,
      "muted-foreground": colors.mutedForeground,
      muted: colors.muted,
      border: colors.border,
      tint: colors.tint,
      "brand-mark": colors.brandMark,
      destructive: colors.destructive,
    },
    fontScale: PixelRatio.getFontScale() * textScale,
  };
}

export function insertKey(choice: InsertChoice) {
  return choice.name === "block" ? choice.style : choice.kind;
}
