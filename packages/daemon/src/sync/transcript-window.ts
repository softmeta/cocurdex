import type { TimelineEntrySize, TimelineSeqRange } from "@cocurdex/db";

export const TRANSCRIPT_WINDOW_BYTES = 256 * 1024;

export interface TranscriptWindow {
  range: TimelineSeqRange;
  olderBeforeSeq: number | null;
}

export function selectTranscriptWindow(
  newestFirst: readonly TimelineEntrySize[],
  beforeSeq: number | null,
  budgetBytes = TRANSCRIPT_WINDOW_BYTES,
): TranscriptWindow {
  let total = 0;
  for (const [index, entry] of newestFirst.entries()) {
    total += entry.bytes;
    const hasOlder = index < newestFirst.length - 1;
    if (entry.turnStart && total >= budgetBytes && hasOlder) {
      return {
        range: { fromSeq: entry.seq, beforeSeq },
        olderBeforeSeq: entry.seq,
      };
    }
  }
  return { range: { fromSeq: null, beforeSeq }, olderBeforeSeq: null };
}
