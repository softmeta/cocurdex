import type {
  ScriptRunAgentRecord,
  ScriptRunRecord,
  ScriptRunSnapshot,
} from "@cocurdex/shared";

export interface ScriptRunRepository {
  saveRun(run: ScriptRunRecord): Promise<void>;
  getRun(runId: string): Promise<ScriptRunSnapshot | null>;
  listRuns(filter: {
    workspaceId?: string;
    requesterSessionId?: string;
  }): Promise<ScriptRunRecord[]>;
  saveAgent(agent: ScriptRunAgentRecord): Promise<void>;
  interruptRunning(now: string): Promise<ScriptRunRecord[]>;
}
