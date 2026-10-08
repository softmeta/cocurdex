import {
  buildNoteDocExtensions,
  type NoteDocExtensionOptions,
} from "@cocurdex/note-doc";
import { Placeholder } from "@tiptap/extensions";
import type { Extensions } from "@tiptap/react";
import { createSlashCommand } from "./slash-command";

export function buildMarkdownBodyExtensions(
  placeholder: string,
  options: NoteDocExtensionOptions = {},
): Extensions {
  return [
    ...buildNoteDocExtensions(options),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "paragraph" ? placeholder : "",
    }),
    createSlashCommand(),
  ];
}
