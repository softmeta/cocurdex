import {
  type Extensions,
  getSchema,
  type NodeViewRenderer,
} from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import type { Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { NoteTable } from "./table";

export const NOTE_DOC_FIELD = "default";
export const NOTE_LINK_PROTOCOLS = ["cocurdex", "cocurdex-pdf", "note"];

export interface NoteDocExtensionOptions {
  collaborative?: boolean;
  codeBlockView?: NodeViewRenderer;
  imageView?: NodeViewRenderer;
}

const CODE_BLOCK_TAB_SIZE = 2;

function buildCodeBlock(view: NodeViewRenderer | undefined) {
  const configured = CodeBlock.configure({
    enableTabIndentation: true,
    tabSize: CODE_BLOCK_TAB_SIZE,
  });
  return view ? configured.extend({ addNodeView: () => view }) : configured;
}

function buildImage(view: NodeViewRenderer | undefined) {
  const configured = Image.configure({ inline: true });
  return view ? configured.extend({ addNodeView: () => view }) : configured;
}

export function buildNoteDocExtensions({
  collaborative = false,
  codeBlockView,
  imageView,
}: NoteDocExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      ...(collaborative ? { undoRedo: false, trailingNode: false } : {}),
      codeBlock: false,
      link: {
        openOnClick: false,
        protocols: NOTE_LINK_PROTOCOLS,
        HTMLAttributes: { target: null, rel: null },
      },
    }),
    buildCodeBlock(codeBlockView),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: false }),
    NoteTable,
    buildImage(imageView),
    Markdown,
  ];
}

let noteSchema: Schema | null = null;

export function getNoteDocSchema(): Schema {
  noteSchema ??= getSchema(buildNoteDocExtensions());
  return noteSchema;
}
