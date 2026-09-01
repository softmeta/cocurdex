import type { SessionNotification } from "@agentclientprotocol/sdk";
import type {
  AgentEvent,
  AgentToolCallRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  AcpSubagentBridge,
  type AcpSubagentProtocol,
} from "./acp-subagent-bridge";

function toolCall(
  status: AgentToolCallRecord["status"],
  rawOutput: unknown,
): AgentToolCallRecord {
  return {
    id: "task-1",
    sessionId: "parent",
    title: "Task",
    kind: "other",
    status,
    content: [],
    rawInput: { variant: "Task", description: "Review" },
    rawOutput,
    locations: [],
    startedAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:01.000Z",
  } satisfies AgentToolCallRecord;
}

describe("AcpSubagentBridge", () => {
  it("buffers child updates until the spawn links and settles through wait", () => {
    const events: AgentEvent[] = [];
    const linked: SessionNotification[][] = [];
    const protocol: AcpSubagentProtocol = {
      inspect(call) {
        if ((call.rawInput as { variant?: string }).variant === "TaskOutput") {
          return {
            kind: "settlement",
            results: [
              { providerSessionId: "native-child", status: "completed" },
            ],
          };
        }
        return {
          kind: "spawn",
          providerSessionId:
            call.status === "completed" ? "native-child" : null,
          status: call.status === "completed" ? "completed" : null,
          type: "reviewer",
          description: "Review",
        };
      },
    };
    const bridge = new AcpSubagentBridge(
      {
        id: "parent",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "grok-build",
        status: "running",
        writeMode: "native-write",
        collaborationMode: "default",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as SessionRecord,
      protocol,
      (event) => events.push(event),
      (_providerSessionId, _session, notifications) =>
        linked.push(notifications),
    );
    bridge.buffer({
      sessionId: "native-child",
      update: { sessionUpdate: "agent_message_chunk" },
    } as SessionNotification);

    expect(bridge.transform(toolCall("in_progress", null))?.subagent).toEqual({
      sessionId: "acp-subagent:parent:task-1",
      type: "reviewer",
      description: "Review",
    });
    bridge.linkSpawn({
      providerSessionId: "native-child",
      type: "reviewer",
      description: "Review",
    });
    expect(
      bridge.transform(toolCall("completed", { text: "native-child" }))?.status,
    ).toBe("completed");
    expect(linked[0]).toHaveLength(1);

    const settlement = toolCall("completed", null);
    settlement.rawInput = { variant: "TaskOutput" };
    expect(bridge.transform(settlement)).toBeNull();
    expect(events.at(-1)).toMatchObject({
      type: "tool.finished",
      toolCall: { id: "task-1", status: "completed" },
    });
    expect(
      bridge.transform(toolCall("completed", { text: "native-child" }))?.status,
    ).toBe("completed");
  });
});
