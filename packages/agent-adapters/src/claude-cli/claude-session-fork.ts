import type {
  ForkSessionOptions,
  ForkSessionResult,
} from "@anthropic-ai/claude-agent-sdk";
import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import { serializeProviderSessionState } from "../shared";

export type ClaudeForkSession = (
  sessionId: string,
  options?: ForkSessionOptions,
) => Promise<ForkSessionResult>;

interface ForkableClaudeState {
  resumeSessionAt?: string;
  runtimeFingerprint?: string;
}

function readForkableState(providerStateJson: string): ForkableClaudeState {
  try {
    const value = JSON.parse(providerStateJson) as Record<string, unknown>;
    return {
      ...(typeof value.resumeSessionAt === "string"
        ? { resumeSessionAt: value.resumeSessionAt }
        : {}),
      ...(typeof value.runtimeFingerprint === "string"
        ? { runtimeFingerprint: value.runtimeFingerprint }
        : {}),
    };
  } catch {
    return {};
  }
}

function fingerprintWorkspace(runtimeFingerprint: string | undefined) {
  if (!runtimeFingerprint) return null;
  try {
    const value = JSON.parse(runtimeFingerprint) as Record<string, unknown>;
    return typeof value.workspaceRootPath === "string"
      ? value.workspaceRootPath
      : null;
  } catch {
    return null;
  }
}

export async function forkClaudeProviderSession(
  payload: ForkProviderSessionPayload,
  forkSession: ClaudeForkSession,
  providerVersion: string,
): Promise<AgentProviderSessionRecord | null> {
  const { source } = payload;
  if (payload.userTurnCount !== null) return null;
  if (!source.providerSessionId || !source.resumable) {
    throw new Error("Claude session has no resumable transcript to fork");
  }
  const state = readForkableState(source.providerStateJson);
  const sourceWorkspace = fingerprintWorkspace(state.runtimeFingerprint);
  if (sourceWorkspace && sourceWorkspace !== payload.workspaceRootPath) {
    throw new Error("Claude transcript belongs to a different workspace");
  }
  const { sessionId } = await forkSession(source.providerSessionId, {
    dir: payload.workspaceRootPath,
    ...(state.resumeSessionAt ? { upToMessageId: state.resumeSessionAt } : {}),
  });
  return {
    sessionId: payload.targetSessionId,
    providerSessionId: sessionId,
    providerStateJson: serializeProviderSessionState({
      adapter: "claude-agent-sdk",
      resume: sessionId,
      ...(state.runtimeFingerprint
        ? { runtimeFingerprint: state.runtimeFingerprint }
        : {}),
      sessionId,
      turnCount: 0,
    }),
    providerVersion,
    resumable: true,
    updatedAt: new Date().toISOString(),
  };
}
