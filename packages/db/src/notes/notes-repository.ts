import type {
  CreateNotePayload,
  DeleteNotePayload,
  MoveNotePayload,
  NoteBacklinksPayload,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  RenameNotePayload,
  UpdateNotePayload,
} from "@cocurdex/shared";

export interface NotesRepository {
  list(): Promise<NoteSummary[]>;
  get(id: string): Promise<NoteRecord | null>;
  create(payload: CreateNotePayload): Promise<NoteRecord>;
  update(payload: UpdateNotePayload): Promise<NoteRecord>;
  rename(payload: RenameNotePayload): Promise<NoteRecord>;
  move(payload: MoveNotePayload): Promise<NoteRecord>;
  delete(payload: DeleteNotePayload): Promise<void>;
  listTags(noteId?: string): Promise<NoteTag[]>;
  listBacklinks(payload: NoteBacklinksPayload): Promise<NoteLink[]>;
}

export class NoteNotFoundError extends Error {
  readonly code = "NOTE_NOT_FOUND";

  constructor(id: string) {
    super(`Note not found: ${id}`);
    this.name = "NoteNotFoundError";
  }
}

export class NoteConflictError extends Error {
  readonly code = "NOTE_REVISION_CONFLICT";

  constructor() {
    super("Note was modified");
    this.name = "NoteConflictError";
  }
}
