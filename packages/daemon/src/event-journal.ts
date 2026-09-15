import type { CocurdexDaemonEvent } from "@cocurdex/shared";

export interface DaemonEventJournalEntry {
  event: CocurdexDaemonEvent;
  seq: number;
}

export interface DaemonEventJournalReplay {
  entries: DaemonEventJournalEntry[];
  // True when the requested position cannot be satisfied from the retained
  // window: the client is behind the oldest retained entry or ahead of this
  // journal's sequence entirely. Callers must resync authoritative state.
  hasGap: boolean;
}

export interface DaemonEventJournal {
  record(event: CocurdexDaemonEvent): DaemonEventJournalEntry;
  entriesAfter(afterSeq: number | undefined): DaemonEventJournalReplay;
}

export function createDaemonEventJournal(capacity = 2000): DaemonEventJournal {
  let seq = 0;
  const buffer: DaemonEventJournalEntry[] = [];
  return {
    record(event) {
      seq += 1;
      const entry: DaemonEventJournalEntry = { event, seq };
      buffer.push(entry);
      if (buffer.length > capacity) {
        buffer.shift();
      }
      return entry;
    },
    entriesAfter(afterSeq) {
      if (afterSeq === undefined) {
        return { entries: [], hasGap: false };
      }
      const oldestRetained = buffer[0]?.seq;
      const hasGap =
        afterSeq > seq ||
        (oldestRetained !== undefined && afterSeq + 1 < oldestRetained);
      return {
        entries: buffer.filter((entry) => entry.seq > afterSeq),
        hasGap,
      };
    },
  };
}
