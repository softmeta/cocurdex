import type { DeckContent, DeckRecord, DeckSummary } from "@cocurdex/shared";
import { DECK_CONFLICT_MESSAGE } from "@cocurdex/shared";

export interface CreateDeckRecordInput {
  title: string;
  workspaceId: string | null;
  content: DeckContent;
}

export interface UpdateDeckRecordInput {
  id: string;
  title?: string;
  workspaceId?: string | null;
  content?: DeckContent;
  expectedRevision?: number;
}

export interface DecksRepository {
  list(): Promise<DeckSummary[]>;
  get(id: string): Promise<DeckRecord | null>;
  create(input: CreateDeckRecordInput): Promise<DeckRecord>;
  update(input: UpdateDeckRecordInput): Promise<DeckRecord>;
  delete(input: { id: string; expectedRevision?: number }): Promise<void>;
}

export class DeckNotFoundError extends Error {
  readonly code = "DECK_NOT_FOUND";

  constructor(id: string) {
    super(`Deck not found: ${id}`);
    this.name = "DeckNotFoundError";
  }
}

export class DeckConflictError extends Error {
  readonly code = "DECK_REVISION_CONFLICT";

  constructor() {
    super(DECK_CONFLICT_MESSAGE);
    this.name = "DeckConflictError";
  }
}
