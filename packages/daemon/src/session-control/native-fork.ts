import {
  type AgentId,
  type AgentProviderSessionRecord,
  type MessageRecord,
  resolveStartContext,
  type StartContextRun,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "../diagnostics";

export interface NativeForkDependencies {
  getProviderSession(
    sessionId: string,
    agentType: AgentId,
  ): Promise<AgentProviderSessionRecord | null>;
  saveProviderSession(
    agentType: AgentId,
    record: AgentProviderSessionRecord,
  ): Promise<void>;
  forkProviderSession(
    agentType: AgentId,
    payload: {
      source: AgentProviderSessionRecord;
      targetSessionId: string;
      workspaceRootPath: string;
      userTurnCount: number | null;
    },
  ): Promise<AgentProviderSessionRecord | null>;
}

export interface NativeForkInput {
  sourceSessionId: string;
  targetSessionId: string;
  workspaceRootPath: string;
  userTurnCount: number | null;
  agentTypes: readonly AgentId[];
  messages: readonly MessageRecord[];
  runs: readonly StartContextRun[];
}

function threadHasSeenEverything(agentType: AgentId, input: NativeForkInput) {
  return (
    resolveStartContext({
      targetAgentType: agentType,
      priorMessages: input.messages,
      runs: input.runs,
      hasProviderThread: true,
      pendingFork: false,
    }).kind === "native"
  );
}

export async function forkProviderThreads(
  dependencies: NativeForkDependencies,
  input: NativeForkInput,
): Promise<AgentId[]> {
  const forked: AgentId[] = [];
  for (const agentType of new Set(input.agentTypes)) {
    const source = await dependencies.getProviderSession(
      input.sourceSessionId,
      agentType,
    );
    if (!source?.resumable || !threadHasSeenEverything(agentType, input)) {
      continue;
    }
    try {
      const record = await dependencies.forkProviderSession(agentType, {
        source,
        targetSessionId: input.targetSessionId,
        workspaceRootPath: input.workspaceRootPath,
        userTurnCount: input.userTurnCount,
      });
      if (!record) continue;
      await dependencies.saveProviderSession(agentType, record);
      forked.push(agentType);
    } catch (error) {
      logDaemonDiagnostic("warn", "session.nativeForkFailed", {
        agentType,
        sessionId: input.sourceSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return forked;
}
