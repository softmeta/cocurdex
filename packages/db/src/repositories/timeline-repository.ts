export interface TimelineSeqRange {
  fromSeq: number | null;
  beforeSeq: number | null;
}

export interface TimelineEntrySize {
  seq: number;
  bytes: number;
  turnStart: boolean;
}

export interface TimelineRepository {
  listEntrySizesNewestFirst(
    sessionId: string,
    beforeSeq: number | null,
  ): TimelineEntrySize[];
}
