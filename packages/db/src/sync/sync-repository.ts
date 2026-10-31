export interface SyncClock {
  databaseId: string;
  seq: number;
  tombstoneFloor: number;
}

export type SyncTombstoneEntity = "session" | "message" | "turnChangeSet";

export interface SyncTombstone {
  changeSeq: number;
  entity: SyncTombstoneEntity;
  entityId: string;
  sessionId: string | null;
}

export interface SyncRepository {
  readClock(): SyncClock;
  listTombstonesSince(changeSeq: number): SyncTombstone[];
  hasTurnChangeSetsChangedSince(sessionId: string, changeSeq: number): boolean;
  pruneTombstones(deletedBefore: string): number;
}
