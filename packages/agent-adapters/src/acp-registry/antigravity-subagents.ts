import type { SessionUpdate } from "@agentclientprotocol/sdk/unstable";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import type { AcpDetachedReplyProtocol } from "../acp/acp-detached-replies";

const INVOKE_SUBAGENT = "invoke_subagent";

function readString(record: unknown, key: string): string | null {
  if (typeof record !== "object" || record === null) {
    return null;
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isInvokeSubagent(nameOrTitle: string | null) {
  return (
    nameOrTitle === INVOKE_SUBAGENT || nameOrTitle === "Run invoke_subagent"
  );
}

/**
 * Antigravity (verified on 1.5.14) completes `invoke_subagent` as soon as the
 * worker starts and streams nothing from the worker over ACP. `session/prompt`
 * returns while workers run; each report then wakes the main agent, which
 * replies on the root session and closes that reply with `usage_update`.
 */
export const antigravityDetachedReplies: AcpDetachedReplyProtocol = {
  readDetachedWorkId(update: SessionUpdate) {
    if (update.sessionUpdate !== "tool_call") {
      return null;
    }
    const name = readString(update, "name") ?? update.title ?? null;
    return isInvokeSubagent(name) ? update.toolCallId : null;
  },
  endsReply(update: SessionUpdate) {
    return update.sessionUpdate === "usage_update";
  },
};

export function normalizeAntigravityToolCall(
  toolCall: AgentToolCallRecord,
): AgentToolCallRecord {
  if (!isInvokeSubagent(toolCall.title)) {
    return toolCall;
  }
  return {
    ...toolCall,
    title: readString(toolCall.rawInput, "Role") ?? "Subagent",
  };
}
