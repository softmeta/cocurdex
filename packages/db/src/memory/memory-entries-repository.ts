export interface StoredMemoryEntry {
  id: string;
  project: string | null;
  title: string;
  content: string;
  kind: string | null;
  importance: "important" | "trivial";
  tags: string[];
  parentId: string | null;
  supersedes: string[];
  supersededBy: string | null;
  seeAlso: string[];
  device: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MemoryEntryHistoryRecord {
  entryId: string;
  action: string;
  title: string | null;
  content: string | null;
  actor: string | null;
  at: string;
}

export interface MemoryEntryChange {
  actor: string | null;
  at: string;
}

export type MemoryEntryPatch = Partial<
  Pick<
    StoredMemoryEntry,
    | "title"
    | "content"
    | "kind"
    | "importance"
    | "tags"
    | "project"
    | "parentId"
    | "supersedes"
    | "supersededBy"
    | "seeAlso"
    | "updatedAt"
  >
>;

export interface MemoryEntrySearchInput {
  /** Phrases of three or more characters, matched through the trigram index. */
  indexedTerms: string[];
  /** Shorter phrases the trigram index cannot hold, matched by substring. */
  shortTerms: string[];
  project: string | null;
  limit: number;
}

export interface MemoryEntriesRepository {
  /** Resolves a full id, or a prefix that names exactly one entry. */
  find(idOrPrefix: string): StoredMemoryEntry | null;
  /** The entry an external library holds under `remoteId`. */
  findByRemoteId(provider: string, remoteId: string): StoredMemoryEntry | null;
  /** Entry id to the id the external library `provider` holds it under. */
  remoteIds(provider: string): Map<string, string>;
  list(input: {
    project: string | null;
    since: string | null;
    limit: number;
  }): StoredMemoryEntry[];
  /** Every entry, deleted ones included. */
  all(): StoredMemoryEntry[];
  search(input: MemoryEntrySearchInput): StoredMemoryEntry[];
  insert(entry: StoredMemoryEntry, change: MemoryEntryChange): void;
  update(
    id: string,
    patch: MemoryEntryPatch,
    change: MemoryEntryChange,
  ): boolean;
  softDelete(id: string, change: MemoryEntryChange): boolean;
  restore(id: string, change: MemoryEntryChange): boolean;
  setRemoteId(provider: string, id: string, remoteId: string | null): void;
  history(input: {
    id: string | null;
    limit: number;
  }): MemoryEntryHistoryRecord[];
  revision(): number;
}
