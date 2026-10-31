import type {
  CreateNotePayload,
  DeleteNotePayload,
  MoveNotePayload,
  NoteBacklinksPayload,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  UpdateNotePayload,
} from "@cocurdex/shared";
import { NOTE_CONFLICT_MESSAGE } from "@cocurdex/shared";

export interface NoteDocRecord {
  id: string;
  revision: number;
  update: Uint8Array;
}

export interface ApplyNoteDocBytesPayload {
  id: string;
  update: Uint8Array;
}

export interface NoteDocApplyResult {
  note: NoteRecord;
  changed: boolean;
}

export interface NotesRepository {
  list(): Promise<NoteSummary[]>;
  get(id: string): Promise<NoteRecord | null>;
  getDoc(id: string, stateVector?: Uint8Array): Promise<NoteDocRecord | null>;
  applyDocUpdate(
    payload: ApplyNoteDocBytesPayload,
  ): Promise<NoteDocApplyResult>;
  create(payload: CreateNotePayload): Promise<NoteRecord>;
  update(payload: UpdateNotePayload): Promise<NoteRecord>;
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
    super(NOTE_CONFLICT_MESSAGE);
    this.name = "NoteConflictError";
  }
}
