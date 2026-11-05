import type {
  MemoryEntry,
  MemoryHistoryEntry,
  MemoryImportResult,
  MemoryProviderCapabilities,
  MemoryRecallItem,
  MemoryRememberInput,
  MemoryRememberResult,
  MemoryUpdateInput,
} from "@cocurdex/shared";

export interface MemoryProviderRecallInput {
  query: string;
  limit: number;
  project: string | null;
  timeoutMs?: number;
}

export interface MemoryProviderListInput {
  limit: number;
  since: string | null;
  project: string | null;
}

export interface MemoryProvider {
  readonly id: string;
  available(): Promise<boolean>;
  capabilities(): Promise<MemoryProviderCapabilities>;
  policy(): Promise<string>;
  recall(
    input: MemoryProviderRecallInput,
  ): Promise<{ items: MemoryRecallItem[]; error: string | null }>;
  show(
    id: string,
    timeoutMs?: number,
  ): Promise<{ entry: MemoryEntry | null; error: string | null }>;
  list(input: MemoryProviderListInput): Promise<MemoryEntry[]>;
  remember(input: MemoryRememberInput): Promise<MemoryRememberResult>;
  update(input: MemoryUpdateInput): Promise<void>;
  forget(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  history(input: {
    id: string | null;
    limit: number;
  }): Promise<MemoryHistoryEntry[]>;
  revision(): Promise<string | null>;
  exportTo(file: string): Promise<void>;
  importFrom(file: string): Promise<MemoryImportResult>;
}
