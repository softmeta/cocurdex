import type { CocurdexDaemonEvent } from "@cocurdex/shared";

export interface DaemonEventJournalEntry {
  event: CocurdexDaemonEvent;
  seq: number;
}

export interface DaemonEventJournal {
  record(event: CocurdexDaemonEvent): DaemonEventJournalEntry;
  entriesAfter(afterSeq: number | undefined): DaemonEventJournalEntry[];
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
        return [];
      }
      return buffer.filter((entry) => entry.seq > afterSeq);
    },
  };
}
