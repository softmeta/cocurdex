import type { AgentToolCallRecord, SessionRecord } from "./contracts";

function mapChildSessionStatus(
  status: AgentToolCallRecord["status"],
): SessionRecord["status"] {
  if (status === "failed") {
    return "error";
  }
  if (status === "completed") {
    return "idle";
  }
  return "running";
}

export function childSessionFromSubagentToolCall(
  parent: SessionRecord,
  toolCall: AgentToolCallRecord,
): SessionRecord | null {
  const subagent = toolCall.subagent;
  if (!subagent?.sessionId || subagent.sessionId === parent.id) {
    return null;
  }

  return {
    ...parent,
    id: subagent.sessionId,
    title: subagent.description.trim() || parent.title,
    sessionKind: "subagent",
    parentSessionId: parent.id,
    parentToolCallId: toolCall.id,
    status: mapChildSessionStatus(toolCall.status),
    createdAt: toolCall.startedAt,
    updatedAt: toolCall.updatedAt,
    lastMessageAt: null,
    archivedAt: null,
  };
}
