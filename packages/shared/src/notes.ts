export type NoteKind = "note" | "folder";

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

export interface RenameNotePayload {
  id: string;
  title: string;
  expectedRevision?: number;
}

export interface MoveNotePayload {
  id: string;
  parentId: string | null;
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
