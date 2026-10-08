export type NoteKind = "note" | "folder";

export const NOTE_CONFLICT_MESSAGE = "Note was modified";

export function isNoteConflictError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes(NOTE_CONFLICT_MESSAGE)
  );
}

/** Lightweight tree projection. Note bodies are loaded separately. */
export interface NoteSummary {
  id: string;
  parentId: string | null;
  workspaceId: string | null;
  kind: NoteKind;
  title: string;
  icon: string | null;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteRecord extends NoteSummary {
  bodyMarkdown: string;
}

export interface CreateNotePayload {
  parentId?: string | null;
  workspaceId?: string | null;
  kind?: NoteKind;
  title?: string;
  bodyMarkdown?: string;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateNotePayload {
  id: string;
  bodyMarkdown?: string;
  title?: string;
  icon?: string | null;
  workspaceId?: string | null;
  expectedRevision?: number;
}

export interface MoveNotePayload {
  id: string;
  parentId: string | null;
  workspaceId?: string | null;
  sortOrder?: number;
  expectedRevision?: number;
}

export interface DeleteNotePayload {
  id: string;
  expectedRevision?: number;
}

export interface GetNotePayload {
  id: string;
}

export interface GetNoteDocPayload {
  id: string;
  stateVector?: string;
}

export interface NoteDocSnapshot {
  id: string;
  revision: number;
  update: string;
}

export interface ApplyNoteDocUpdatePayload {
  id: string;
  update: string;
}

export interface NoteTag {
  id: string;
  name: string;
}

export interface NoteLink {
  sourceNoteId: string;
  targetNoteId: string | null;
  targetRef: string;
  kind: "markdown" | "wikilink";
}

export interface NoteBacklinksPayload {
  id: string;
}
