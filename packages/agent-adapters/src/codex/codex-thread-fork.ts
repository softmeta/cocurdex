import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import { serializeProviderSessionState } from "../shared";
import type { acquireCodexClient } from "./codex-app-server-pool";

export async function forkCodexProviderSession(
  payload: ForkProviderSessionPayload,
  acquireClient: typeof acquireCodexClient,
): Promise<AgentProviderSessionRecord | null> {
  const { source } = payload;
  if (payload.userTurnCount !== null) return null;
  if (!source.providerSessionId || !source.resumable) {
    throw new Error("Codex session has no resumable thread to fork");
  }
  const lease = acquireClient();
  try {
    const result = await lease.client.forkThread({
      threadId: source.providerSessionId,
      cwd: payload.workspaceRootPath,
      excludeTurns: true,
    });
    const threadId = result.thread.id;
    return {
      sessionId: payload.targetSessionId,
      providerSessionId: threadId,
      providerStateJson: serializeProviderSessionState({
        adapter: "codex",
        threadId,
      }),
      providerVersion: source.providerVersion,
      resumable: true,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    lease.release();
  }
}
