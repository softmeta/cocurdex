import type { RoutineRecord, RoutineRunRecord } from "@cocurdex/shared";

export interface RoutineRepository {
  list(): RoutineRecord[];
  listByAgent(agentId: string): RoutineRecord[];
  getById(id: string): RoutineRecord | null;
  findBySession(sessionId: string): RoutineRecord | null;
  listSessionIds(routineId: string): string[];
  upsert(routine: RoutineRecord): void;
  delete(id: string): void;
  listRuns(routineId: string | null, limit: number): RoutineRunRecord[];
  getRun(id: string): RoutineRunRecord | null;
  saveRun(run: RoutineRunRecord): void;
  countRunsSince(routineId: string, since: string): number;
  listRunning(): RoutineRunRecord[];
  latestFinishedRuns(): RoutineRunRecord[];
  listFinishedRunsSince(since: string): RoutineRunRecord[];
}
