import { describe, expect, it } from "vitest";
import type { AgentId, AgentToolCallRecord, SessionRecord } from "./contracts";
import { childSessionFromSubagentToolCall } from "./subagent-session";

function parentSession(agentType: AgentId): SessionRecord {
  return {
    id: "parent",
    workspaceId: "workspace-1",
    title: "Parent",
    agentType,
    sessionKind: "main",
    parentSessionId: null,
    status: "running",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    lastMessageAt: "2026-08-31T00:00:00.000Z",
    archivedAt: null,
    providerSnapshot: null,
  };
}

function toolCall(
  agentType: AgentId,
  sessionId: string,
  description: string,
): AgentToolCallRecord {
  return {
    id: `${agentType}-spawn`,
    sessionId: "parent",
    title: "Using subagent",
    kind: "task",
    status: "in_progress",
    subagent: {
      sessionId,
      type: "explore",
      description,
    },
    content: [],
    rawInput: {},
    locations: [],
    startedAt: "2026-08-31T00:01:00.000Z",
    updatedAt: "2026-08-31T00:01:01.000Z",
  };
}

describe("childSessionFromSubagentToolCall", () => {
  it.each([
    ["claude-agent", "claude-subagent:parent:task-1", "Review changes"],
    ["codex", "codex-subagent:parent:child-thread", "Review changes"],
    ["grok-build", "acp-subagent:parent:task-1", "Standards review"],
    ["opencode", "opencode-subagent:parent:child-1", "Explore source"],
  ] as const)("projects a %s child session under its parent", (agentType, sessionId, description) => {
    expect(
      childSessionFromSubagentToolCall(
        parentSession(agentType),
        toolCall(agentType, sessionId, description),
      ),
    ).toMatchObject({
      id: sessionId,
      agentType,
      parentSessionId: "parent",
      parentToolCallId: `${agentType}-spawn`,
      sessionKind: "subagent",
      status: "running",
      title: description,
      workspaceId: "workspace-1",
    });
  });

  it("returns null when the tool call is not a subagent", () => {
    expect(
      childSessionFromSubagentToolCall(parentSession("codex"), {
        ...toolCall("codex", "codex-subagent:parent:child", "Review"),
        subagent: null,
      }),
    ).toBeNull();
  });
});
