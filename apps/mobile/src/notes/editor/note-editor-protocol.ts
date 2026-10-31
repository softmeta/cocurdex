export type NoteBlockStyle =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "codeBlock";

export type NoteInsertKind =
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "horizontalRule"
  | "table";

export type NoteMark = "bold" | "italic" | "strike" | "code";

export type NoteEditorCommand =
  | { name: "block"; style: NoteBlockStyle; fromSlash?: boolean }
  | { name: "insert"; kind: NoteInsertKind; fromSlash?: boolean }
  | { name: "mark"; mark: NoteMark }
  | { name: "list"; kind: "bulletList" | "taskList" }
  | { name: "link"; href: string | null }
  | { name: "dismissSlash" }
  | { name: "blur" };

export interface NoteEditorTheme {
  colors: Record<string, string>;
  fontScale: number;
}

export interface NoteCodeToken {
  from: number;
  to: number;
  color: string;
}

export interface NoteCodeRequest {
  id: number;
  language: string;
  code: string;
}

export interface NoteEditorFormatState {
  block: NoteBlockStyle;
  marks: Record<NoteMark, boolean>;
  bulletList: boolean;
  taskList: boolean;
  link: string | null;
}

export type NoteEditorContent =
  | { kind: "doc"; state: string }
  | { kind: "markdown"; markdown: string };

export type NoteEditorInbound =
  | {
      type: "init";
      content: NoteEditorContent;
      title: string;
      meta: string | null;
      titlePlaceholder: string;
      bodyPlaceholder: string;
      theme: NoteEditorTheme;
      focusTitle: boolean;
      editable: boolean;
      interactive: boolean;
    }
  | { type: "editable"; editable: boolean }
  | { type: "remote"; update: string }
  | { type: "title"; title: string }
  | { type: "meta"; meta: string }
  | { type: "theme"; theme: NoteEditorTheme }
  | { type: "highlighted"; id: number; tokens: NoteCodeToken[] }
  | { type: "command"; command: NoteEditorCommand };

export type NoteEditorOutbound =
  | { type: "ready" }
  | { type: "update"; update: string }
  | { type: "markdown"; markdown: string }
  | { type: "title"; title: string }
  | { type: "focus"; focused: boolean }
  | { type: "format"; format: NoteEditorFormatState }
  | { type: "slash" }
  | { type: "properties" }
  | { type: "openLink"; href: string }
  | { type: "openImage"; src: string; alt: string }
  | { type: "highlight"; requests: NoteCodeRequest[] };

const OUTBOUND_TYPES = new Set<NoteEditorOutbound["type"]>([
  "ready",
  "update",
  "markdown",
  "title",
  "focus",
  "format",
  "slash",
  "properties",
  "openLink",
  "openImage",
  "highlight",
]);

export function parseNoteEditorMessage(
  data: string,
): NoteEditorOutbound | null {
  try {
    const message: unknown = JSON.parse(data);
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      OUTBOUND_TYPES.has(message.type as NoteEditorOutbound["type"])
    ) {
      return message as NoteEditorOutbound;
    }
    return null;
  } catch {
    return null;
  }
}

export function noteEditorScript(message: NoteEditorInbound) {
  return `window.noteEditor&&window.noteEditor.receive(${JSON.stringify(message)});true;`;
}
