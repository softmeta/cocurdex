import { type Extensions, getSchema } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import type { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";

export const NOTE_DOC_FIELD = "default";
export const NOTE_LINK_PROTOCOLS = ["cocurdex-pdf", "note"];

export interface NoteDocExtensionOptions {
  collaborative?: boolean;
}

export function buildNoteDocExtensions({
  collaborative = false,
}: NoteDocExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      ...(collaborative ? { undoRedo: false, trailingNode: false } : {}),
      link: {
        openOnClick: false,
        protocols: NOTE_LINK_PROTOCOLS,
        HTMLAttributes: { target: null, rel: null },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    Image.configure({ inline: true }),
    Markdown,
  ];
}

let noteSchema: Schema | null = null;

export function getNoteDocSchema(): Schema {
  noteSchema ??= getSchema(buildNoteDocExtensions());
  return noteSchema;
}
