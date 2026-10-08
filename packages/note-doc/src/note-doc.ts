import {
  updateYFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "@tiptap/y-tiptap";
import { fromBase64, toBase64 } from "lib0/buffer";
import * as Y from "yjs";
import { serializeNoteMarkdown } from "./markdown";
import { noteMarkdownToNode } from "./markdown-to-node";
import { getNoteDocSchema, NOTE_DOC_FIELD } from "./schema";

export interface NoteDocChange {
  state: Uint8Array;
  markdown: string;
  changed: boolean;
}

function loadDoc(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

function writeMarkdown(doc: Y.Doc, markdown: string): void {
  const node = noteMarkdownToNode(getNoteDocSchema(), markdown);
  doc.transact(() => {
    updateYFragment(doc, doc.getXmlFragment(NOTE_DOC_FIELD), node, {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
}

function readMarkdown(doc: Y.Doc): string {
  const root = yXmlFragmentToProseMirrorRootNode(
    doc.getXmlFragment(NOTE_DOC_FIELD),
    getNoteDocSchema(),
  );
  return serializeNoteMarkdown(root.toJSON());
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}

function changeDoc(state: Uint8Array, mutate: (doc: Y.Doc) => void) {
  const doc = loadDoc(state);
  const before = Y.encodeStateVector(doc);
  mutate(doc);
  const changed = !sameBytes(before, Y.encodeStateVector(doc));
  return {
    state: changed ? Y.encodeStateAsUpdate(doc) : state,
    markdown: readMarkdown(doc),
    changed,
  };
}

export function createNoteDocState(markdown: string): Uint8Array {
  const doc = new Y.Doc();
  writeMarkdown(doc, markdown);
  return Y.encodeStateAsUpdate(doc);
}

export function noteDocToMarkdown(state: Uint8Array): string {
  return readMarkdown(loadDoc(state));
}

export function applyMarkdownToNoteDoc(
  state: Uint8Array,
  markdown: string,
): NoteDocChange {
  return changeDoc(state, (doc) => writeMarkdown(doc, markdown));
}

export function applyNoteDocUpdate(
  state: Uint8Array,
  update: Uint8Array,
): NoteDocChange {
  return changeDoc(state, (doc) => Y.applyUpdate(doc, update));
}

export function diffNoteDoc(
  state: Uint8Array,
  stateVector?: Uint8Array,
): Uint8Array {
  return stateVector ? Y.diffUpdate(state, stateVector) : state;
}

export function noteDocStateVector(state: Uint8Array): Uint8Array {
  return Y.encodeStateVectorFromUpdate(state);
}

export function encodeNoteDocBytes(bytes: Uint8Array): string {
  return toBase64(bytes);
}

export function decodeNoteDocBytes(encoded: string): Uint8Array {
  return fromBase64(encoded);
}
