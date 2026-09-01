import type {
  AgentEvent,
  AgentToolCallRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import type { CodexAppServerNotification } from "./codex-app-server-client";
import { CodexSubagentRouter } from "./codex-subagent-router";

function spawnToolCall(): AgentToolCallRecord {
  return {
    id: "spawn-1",
    sessionId: "parent",
    title: "Using subagent",
    kind: "collaboration",
    status: "completed",
    subagent: {
      sessionId: "codex-subagent:parent:child-thread",
      type: "gpt-5.6-sol",
      description: "Review changes",
    },
    content: [],
    rawInput: {
      tool: "spawnAgent",
      receiverThreadIds: ["child-thread"],
    },
    rawOutput: {
      agentsStates: { "child-thread": { status: "running" } },
    },
    locations: [],
    startedAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:01.000Z",
  };
}

describe("CodexSubagentRouter", () => {
  it("subscribes the child thread and settles it from collaboration state", () => {
    const events: AgentEvent[] = [];
    const childNotifications: Array<
      (value: CodexAppServerNotification) => void
    > = [];
    const router = new CodexSubagentRouter({
      parentSession: {
        id: "parent",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "codex",
        status: "running",
        writeMode: "native-write",
        collaborationMode: "default",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as SessionRecord,
      onEvent: (event) => events.push(event),
      subscribe(providerSessionId, onNotification) {
        expect(providerSessionId).toBe("child-thread");
        childNotifications.push(onNotification);
      },
    });

    expect(router.transform(spawnToolCall())?.status).toBe("in_progress");
    childNotifications[0]?.({
      method: "item/completed",
      params: {
        item: { id: "message-1", type: "agentMessage", text: "Reviewed" },
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.completed",
          sessionId: "codex-subagent:parent:child-thread",
        }),
      ]),
    );

    const wait = spawnToolCall();
    wait.id = "wait-1";
    wait.subagent = null;
    wait.rawInput = { tool: "wait", receiverThreadIds: ["child-thread"] };
    wait.rawOutput = {
      agentsStates: { "child-thread": { status: "completed" } },
    };
    expect(router.transform(wait)).toBeNull();
    expect(events.at(-1)).toMatchObject({
      type: "tool.finished",
      toolCall: { id: "spawn-1", status: "completed" },
    });
  });

  it("projects a nested spawnAgent onto the child session", () => {
    const events: AgentEvent[] = [];
    const childNotifications: Array<
      (value: CodexAppServerNotification) => void
    > = [];
    const router = new CodexSubagentRouter({
      parentSession: {
        id: "parent",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "codex",
        status: "running",
        writeMode: "native-write",
        collaborationMode: "default",
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as SessionRecord,
      onEvent: (event) => events.push(event),
      subscribe(_providerSessionId, onNotification) {
        childNotifications.push(onNotification);
      },
    });

    router.transform(spawnToolCall());
    childNotifications[0]?.({
      method: "item/started",
      params: {
        item: {
          id: "spawn-2",
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "inProgress",
          senderThreadId: "child-thread",
          receiverThreadIds: ["grandchild-thread"],
          prompt: "Nested review",
          model: "gpt-5.6-sol",
          agentsStates: { "grandchild-thread": { status: "running" } },
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.upserted",
          session: expect.objectContaining({
            id: "codex-subagent:codex-subagent:parent:child-thread:grandchild-thread",
            parentSessionId: "codex-subagent:parent:child-thread",
            sessionKind: "subagent",
            title: "Nested review",
          }),
        }),
      ]),
    );
  });
});
