import type { RunRecord, RunStatus } from "@cocurdex/shared";

export type TerminalRunStatus = Exclude<RunStatus, "running">;

export interface InterruptedRuns {
  runs: RunRecord[];
  sessionIds: string[];
}

export interface RunRepository {
  insert(run: RunRecord): RunRecord;
  getById(runId: string): RunRecord | null;
  getActiveBySessionId(sessionId: string): RunRecord | null;
  listActive(): RunRecord[];
  listBySessionId(sessionId: string): RunRecord[];
  finish(
    runId: string,
    status: TerminalRunStatus,
    endedAt: string,
    error?: string | null,
  ): RunRecord | null;
  interruptRunning(endedAt: string): InterruptedRuns;
}
