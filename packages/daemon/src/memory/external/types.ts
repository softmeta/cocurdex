import type {
  MemoryEntry,
  MemoryProviderId,
  MemoryProviderStatus,
  MemoryRecallItem,
  MemorySettings,
} from "@cocurdex/shared";
import type { MemoryProvider } from "../provider";

/**
 * An external memory library the built-in store is kept in step with. The
 * built-in store always holds every memory; the library adds recall of its
 * own and whatever it offers beyond the store (sync across devices, a wiki).
 */
export interface ExternalMemory {
  readonly id: MemoryProviderId;
  /** Read and written by library sync, and asked to widen recall. */
  readonly library: MemoryProvider;
  /** Prepares the library when the daemon starts or the user chooses it. */
  start(reason: "startup" | "chosen"): Promise<void>;
  /** The user chose another library or none. */
  stop(): Promise<void>;
  /** The daemon is exiting. */
  shutdown(): Promise<void>;
  /** Recall and sync may use the library now. */
  usable(): Promise<boolean>;
  status(refresh: boolean): Promise<Omit<MemoryProviderStatus, "lastSyncAt">>;
  settingsChanged(previous: MemorySettings, next: MemorySettings): void;
  /** Read-only hits from a store the user keeps outside Cocurdex. */
  referenceRecall?(input: {
    query: string;
    limit: number;
    timeoutMs: number;
  }): Promise<MemoryRecallItem[]>;
  referenceShow?(id: string, timeoutMs: number): Promise<MemoryEntry | null>;
  /** An instruction for an agent whose own setup also drives this library. */
  hostNote?(agentType: string): Promise<string | null>;
}
