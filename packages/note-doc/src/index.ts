export { decodeNoteDocBytes, encodeNoteDocBytes } from "./bytes";
export { parseNoteMarkdown, serializeNoteMarkdown } from "./markdown";
export {
  applyMarkdownToNoteDoc,
  applyNoteDocUpdate,
  createNoteDocState,
  diffNoteDoc,
  type NoteDocChange,
  noteDocStateVector,
  noteDocToMarkdown,
} from "./note-doc";
export {
  buildNoteDocExtensions,
  getNoteDocSchema,
  NOTE_DOC_FIELD,
  NOTE_LINK_PROTOCOLS,
  type NoteDocExtensionOptions,
} from "./schema";
