export interface PushOutboxRow {
  id: string;
  targetHandle: string;
  plaintext: string;
  collapseId: string;
  expiresAt: number;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
}

export interface PushOutboxRepository {
  insert(row: PushOutboxRow): void;
  listDue(at: string, limit: number): PushOutboxRow[];
  reschedule(id: string, attempts: number, nextAttemptAt: string): void;
  delete(id: string): void;
  deleteExpired(nowSeconds: number): number;
}
