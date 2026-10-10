import {
  type AgentEvent,
  CONTEXT_COMPACTION_TOOL_KIND,
  readContextCompactionDetails,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createClaudeMessageMapper } from "./claude-message-mapper";

describe("createClaudeMessageMapper usage", () => {
  it("keeps assistant step usage out of absolute context snapshots", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });

    mapper.handleMessage({
      type: "assistant",
      message: {
        id: "message-1",
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: "Done" }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        },
      },
    } as never);
    mapper.handleMessage({
      type: "result",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
      },
      modelUsage: {
        "claude-haiku-4-5-20251001": {
          contextWindow: 200_000,
        },
      },
      total_cost_usd: 0.01,
    } as never);

    expect(events.filter((event) => event.type === "usage.updated")).toEqual([
      expect.objectContaining({
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheCreationInputTokens: 30,
          cacheReadInputTokens: 40,
          contextWindowSize: 200_000,
          totalCostUsd: 0.01,
        },
      }),
    ]);
  });

  it("emits session-only usage without settling the active turn", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });

    mapper.handleMessage(
      {
        type: "result",
        usage: { input_tokens: 900, output_tokens: 0 },
        uuid: "resume-result",
      } as never,
      { resultAttribution: "session-only" },
    );

    expect(events).toEqual([
      expect.objectContaining({
        attribution: "session-only",
        type: "usage.updated",
        usage: expect.objectContaining({ inputTokens: 900, outputTokens: 0 }),
      }),
    ]);
  });
});

describe("createClaudeMessageMapper subagents", () => {
  it("projects Task messages into an isolated child session", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
      parentSession: {
        id: "session-1",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "claude-agent",
        status: "running",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as never,
    });

    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_use",
            id: "task-1",
            name: "Task",
            input: {
              description: "Review changes",
              subagent_type: "reviewer",
            },
          },
        ],
      },
    } as never);
    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: { content: [{ type: "text", text: "Child result" }] },
    } as never);
    mapper.handleMessage({ type: "result" } as never);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.upserted",
          sessionId: "claude-subagent:session-1:task-1",
        }),
        expect.objectContaining({
          type: "tool.started",
          toolCall: expect.objectContaining({
            subagent: {
              sessionId: "claude-subagent:session-1:task-1",
              type: "reviewer",
              description: "Review changes",
            },
          }),
        }),
      ]),
    );
  });

  it("projects a nested Task onto the child session", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
      parentSession: {
        id: "session-1",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "claude-agent",
        status: "running",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as never,
    });

    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_use",
            id: "task-1",
            name: "Task",
            input: { description: "Review changes", subagent_type: "reviewer" },
          },
        ],
      },
    } as never);
    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: {
        content: [
          {
            type: "tool_use",
            id: "task-2",
            name: "Task",
            input: { description: "Nested review", subagent_type: "explore" },
          },
        ],
      },
    } as never);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.upserted",
          sessionId: "claude-subagent:claude-subagent:session-1:task-1:task-2",
          session: expect.objectContaining({
            parentSessionId: "claude-subagent:session-1:task-1",
            sessionKind: "subagent",
            title: "Nested review",
          }),
        }),
      ]),
    );
  });

  it("persists child assistant text from complete Agent messages", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
      parentSession: {
        id: "session-1",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "claude-agent",
        status: "running",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as never,
    });

    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_use",
            id: "agent-1",
            name: "Agent",
            input: {
              description: "Review working tree changes",
              subagent_type: "general-purpose",
            },
          },
        ],
      },
    } as never);
    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: "agent-1",
      message: {
        content: [{ type: "tool_use", id: "read-1", name: "Read", input: {} }],
      },
    } as never);
    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: "agent-1",
      message: {
        content: [{ type: "text", text: "## 审查结论\n校验全部通过。" }],
      },
    } as never);

    const childMessages = events.filter(
      (event) =>
        event.type === "message.completed" &&
        event.sessionId === "claude-subagent:session-1:agent-1",
    );

    expect(childMessages).toEqual([
      expect.objectContaining({
        type: "message.completed",
        sessionId: "claude-subagent:session-1:agent-1",
        message: expect.objectContaining({
          role: "assistant",
          content: "## 审查结论\n校验全部通过。",
        }),
      }),
    ]);
  });

  it("flushes streamed child text once when the complete message repeats it", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
      parentSession: {
        id: "session-1",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "claude-agent",
        status: "running",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as never,
    });

    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_use",
            id: "task-1",
            name: "Task",
            input: { description: "Review changes", subagent_type: "reviewer" },
          },
        ],
      },
    } as never);
    mapper.handleMessage({
      event: {
        delta: { text: "Child result" },
        type: "content_block_delta",
      },
      parent_tool_use_id: "task-1",
      type: "stream_event",
    } as never);
    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: "task-1",
      message: { content: [{ type: "text", text: "Child result" }] },
    } as never);

    const childMessages = events.filter(
      (event) =>
        event.type === "message.completed" &&
        event.sessionId === "claude-subagent:session-1:task-1",
    );

    expect(childMessages).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ content: "Child result" }),
      }),
    ]);
  });

  it("flushes streamed child text when the Agent task_notification arrives", () => {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
      parentSession: {
        id: "session-1",
        workspaceId: "workspace",
        title: "Parent",
        agentType: "claude-agent",
        status: "running",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-08-31T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: null,
      } as never,
    });

    mapper.handleMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          {
            type: "tool_use",
            id: "agent-1",
            name: "Agent",
            input: {
              description: "Review current uncommitted changes",
              subagent_type: "general-purpose",
            },
          },
        ],
      },
    } as never);
    mapper.handleMessage({
      event: {
        delta: { text: "## Checks — all green" },
        type: "content_block_delta",
      },
      parent_tool_use_id: "agent-1",
      type: "stream_event",
    } as never);
    mapper.handleMessage({
      type: "system",
      subtype: "task_notification",
      tool_use_id: "agent-1",
      status: "completed",
      summary: "Review finished.",
    } as never);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.completed",
          sessionId: "claude-subagent:session-1:agent-1",
          message: expect.objectContaining({
            content: "## Checks — all green",
          }),
        }),
        expect.objectContaining({
          type: "tool.finished",
          toolCall: expect.objectContaining({
            id: "agent-1",
            rawOutput: "Review finished.",
            status: "completed",
          }),
        }),
      ]),
    );
  });
});

describe("createClaudeMessageMapper reasoning", () => {
  function createMapper() {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });
    return { events, mapper };
  }

  function streamDelta(delta: Record<string, unknown>) {
    return {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta },
      parent_tool_use_id: null,
    } as never;
  }

  function completedMessages(events: AgentEvent[]) {
    return events.flatMap((event) =>
      event.type === "message.completed"
        ? [{ kind: event.message.kind, content: event.message.content }]
        : [],
    );
  }

  it("streams thinking summaries as a reasoning message before the response", () => {
    const { events, mapper } = createMapper();

    mapper.handleMessage(
      streamDelta({ type: "thinking_delta", thinking: "Check the " }),
    );
    mapper.handleMessage(
      streamDelta({ type: "thinking_delta", thinking: "config." }),
    );
    mapper.handleMessage({
      type: "assistant",
      message: {
        content: [{ type: "thinking", thinking: "Check the config." }],
      },
    } as never);
    mapper.handleMessage(streamDelta({ type: "text_delta", text: "Done" }));
    mapper.handleMessage({ type: "result" } as never);

    expect(
      events
        .filter((event) => event.type === "message.delta")
        .map((event) => event.kind),
    ).toEqual(["reasoning", "reasoning", undefined]);
    expect(completedMessages(events)).toEqual([
      { kind: "reasoning", content: "Check the config." },
      { kind: undefined, content: "Done" },
    ]);
  });

  it("falls back to the thinking block when no deltas were streamed", () => {
    const { events, mapper } = createMapper();

    mapper.handleMessage({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "Plan the edit." },
          { type: "text", text: "Edited." },
        ],
      },
    } as never);

    expect(completedMessages(events)).toEqual([
      { kind: "reasoning", content: "Plan the edit." },
      { kind: undefined, content: "Edited." },
    ]);
  });

  it("drops omitted thinking blocks", () => {
    const { events, mapper } = createMapper();

    mapper.handleMessage({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "Done" },
        ],
      },
    } as never);

    expect(completedMessages(events)).toEqual([
      { kind: undefined, content: "Done" },
    ]);
  });
});

describe("createClaudeMessageMapper context compaction", () => {
  function createMapper() {
    const events: AgentEvent[] = [];
    const mapper = createClaudeMessageMapper({
      sessionId: "session-1",
      logLabel: "[ClaudeTest]",
      onEvent: (event) => events.push(event),
    });
    const compactionEvents = () =>
      events.flatMap((event) =>
        (event.type === "tool.started" || event.type === "tool.finished") &&
        event.toolCall.kind === CONTEXT_COMPACTION_TOOL_KIND
          ? [event]
          : [],
      );
    return { compactionEvents, mapper };
  }

  it("tracks compaction from the compacting status to its boundary", () => {
    const { compactionEvents, mapper } = createMapper();

    mapper.handleMessage({
      type: "system",
      subtype: "status",
      status: "compacting",
    } as never);
    mapper.handleMessage({
      type: "system",
      subtype: "compact_boundary",
      uuid: "boundary-1",
      compact_metadata: {
        trigger: "auto",
        pre_tokens: 180_000,
        post_tokens: 22_000,
      },
    } as never);

    const [started, finished] = compactionEvents();
    expect(compactionEvents()).toHaveLength(2);
    expect(started?.toolCall.status).toBe("in_progress");
    expect(finished?.toolCall.id).toBe(started?.toolCall.id);
    expect(finished?.toolCall.status).toBe("completed");
    expect(
      readContextCompactionDetails({ rawInput: finished?.toolCall.rawInput }),
    ).toEqual({
      trigger: "auto",
      tokensBefore: 180_000,
      tokensAfter: 22_000,
      error: null,
    });
  });

  it("records a boundary that arrives without a compacting status", () => {
    const { compactionEvents, mapper } = createMapper();

    mapper.handleMessage({
      type: "system",
      subtype: "compact_boundary",
      uuid: "boundary-1",
      compact_metadata: { trigger: "manual", pre_tokens: 90_000 },
    } as never);

    expect(compactionEvents().map((event) => event.toolCall.status)).toEqual([
      "in_progress",
      "completed",
    ]);
    expect(compactionEvents()[1]?.toolCall.id).toBe("boundary-1");
  });

  it("fails the compaction when Claude reports a failed result", () => {
    const { compactionEvents, mapper } = createMapper();

    mapper.handleMessage({
      type: "system",
      subtype: "status",
      status: "compacting",
    } as never);
    mapper.handleMessage({
      type: "system",
      subtype: "status",
      status: null,
      compact_result: "failed",
      compact_error: "Conversation too long",
    } as never);

    const finished = compactionEvents().at(-1);
    expect(finished?.toolCall.status).toBe("failed");
    expect(
      readContextCompactionDetails({ rawInput: finished?.toolCall.rawInput })
        .error,
    ).toBe("Conversation too long");
  });

  it("closes an unfinished compaction when the turn ends", () => {
    const { compactionEvents, mapper } = createMapper();

    mapper.handleMessage({
      type: "system",
      subtype: "status",
      status: "compacting",
    } as never);
    mapper.handleMessage({ type: "result" } as never);

    expect(compactionEvents().at(-1)?.toolCall.status).toBe("failed");
  });
});
