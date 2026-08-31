import type { AgentEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AcpEventMapper } from "./acp-event-mapper";

describe("AcpEventMapper", () => {
  it("preserves incremental tool updates instead of collapsing them", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Edit file",
        kind: "edit",
        status: "pending",
        locations: [{ path: "/workspace/a.ts", line: 4 }],
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "in_progress",
        rawInput: { path: "/workspace/a.ts" },
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "Updated a.ts",
            },
          },
        ],
        rawOutput: {
          type: "Bash",
          output: [85, 112, 100, 97, 116, 101, 100],
        },
      },
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "tool.started",
        toolCall: expect.objectContaining({
          id: "tool-1",
          status: "pending",
        }),
      }),
      expect.objectContaining({
        type: "tool.updated",
        toolCall: expect.objectContaining({
          id: "tool-1",
          status: "in_progress",
          rawInput: { path: "/workspace/a.ts" },
          content: [{ type: "text", text: "Updated a.ts" }],
          rawOutput: {
            type: "Bash",
            output: [85, 112, 100, 97, 116, 101, 100],
          },
        }),
      }),
    ]);
  });

  it("settles unfinished tool calls when the turn is cancelled", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-08-31T05:23:54.429Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Inspect repository",
        kind: "execute",
        status: "pending",
      },
    });
    mapper.complete("cancelled", 13_958);

    expect(events).toContainEqual({
      type: "tool.finished",
      sessionId: "app-session-1",
      toolCall: expect.objectContaining({
        id: "tool-1",
        status: "failed",
      }),
    });
  });

  it("forwards dynamic ACP commands and session configuration", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          {
            name: "review",
            description: "Review the current workspace",
          },
        ],
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            name: "Model",
            type: "select",
            category: "model",
            currentValue: "grok-code",
            options: [{ value: "grok-code", name: "Grok Code" }],
          },
        ],
      },
    });

    expect(events).toContainEqual({
      type: "commands.updated",
      sessionId: "app-session-1",
      commands: [
        {
          name: "review",
          description: "Review the current workspace",
          source: "agent",
        },
      ],
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "session.config.updated",
        sessionId: "app-session-1",
        configOptions: [
          expect.objectContaining({
            id: "model",
            category: "model",
            currentValue: "grok-code",
          }),
        ],
      }),
    );
  });

  it("groups contiguous chunks without message IDs into one message", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hel" },
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "lo" },
      },
    });
    mapper.complete("end_turn", 1);

    const deltaMessageIds = events.flatMap((event) =>
      event.type === "message.delta" ? [event.messageId] : [],
    );
    const completed = events.filter(
      (event) => event.type === "message.completed",
    );

    expect(new Set(deltaMessageIds).size).toBe(1);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      message: {
        kind: "response",
        content: "Hello",
      },
    });
  });

  it("keeps interleaved provider messages in separate segments", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    const chunks: [string, string][] = [
      ["assistant-1", "I'll map "],
      ["assistant-2", "I'll inspect "],
      ["assistant-1", "the review path."],
      ["assistant-2", "the engine schema."],
    ];
    for (const [messageId, text] of chunks) {
      mapper.handle({
        sessionId: "provider-session-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          messageId,
          content: { type: "text", text },
        },
      });
    }
    mapper.complete("end_turn", 1);

    const completedMessages = events.flatMap((event) =>
      event.type === "message.completed" ? [event.message.content] : [],
    );

    expect(completedMessages).toEqual([
      "I'll map the review path.",
      "I'll inspect the engine schema.",
    ]);
  });

  it("preserves response-tool-response ordering as separate message segments", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "provider-message-1",
        content: { type: "text", text: "I will inspect the repository." },
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "Inspect repository",
        status: "pending",
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
      },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "provider-message-1",
        content: { type: "text", text: "Here is the final analysis." },
      },
    });
    mapper.complete("end_turn", 1);

    const completedMessages = events.flatMap((event) =>
      event.type === "message.completed" ? [event.message] : [],
    );
    const timeline = [
      ...completedMessages.map((message) => ({
        kind: "message" as const,
        content: message.content,
        at: message.createdAt,
      })),
      ...events.flatMap((event) =>
        event.type === "tool.started"
          ? [
              {
                kind: "tool" as const,
                content: event.toolCall.title,
                at: event.toolCall.startedAt,
              },
            ]
          : [],
      ),
    ].sort((left, right) => left.at.localeCompare(right.at));

    expect(completedMessages.map((message) => message.content)).toEqual([
      "I will inspect the repository.",
      "Here is the final analysis.",
    ]);
    expect(timeline.map((item) => item.kind)).toEqual([
      "message",
      "tool",
      "message",
    ]);
  });

  it("does not complete messages from an earlier turn again", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "assistant-1",
        content: { type: "text", text: "First" },
      },
    });
    mapper.complete("end_turn", 1);
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        messageId: "assistant-2",
        content: { type: "text", text: "Second" },
      },
    });
    mapper.complete("end_turn", 1);

    expect(
      events.filter(
        (event) =>
          event.type === "message.completed" &&
          event.message.content === "First",
      ),
    ).toHaveLength(1);
  });

  it("maps Grok _meta.totalTokens to absolute context usage updates", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.initializeSessionState({ contextWindowSize: 500_000 });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hi" },
      },
      _meta: { totalTokens: 12_000 },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " again" },
      },
      // Same fill — must not re-emit a usage event.
      _meta: { totalTokens: 12_000 },
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "read_file",
        kind: "read",
        status: "pending",
      },
      _meta: { totalTokens: 24_000 },
    });

    const usageEvents = events.filter(
      (event) => event.type === "usage.updated",
    );
    expect(usageEvents).toEqual([
      expect.objectContaining({
        type: "usage.updated",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          contextWindowSize: 500_000,
        },
      }),
      expect.objectContaining({
        type: "usage.updated",
        sessionId: "app-session-1",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          contextTokensUsed: 12_000,
          contextWindowSize: 500_000,
        },
      }),
      expect.objectContaining({
        type: "usage.updated",
        usage: expect.objectContaining({
          contextTokensUsed: 24_000,
          contextWindowSize: 500_000,
        }),
      }),
    ]);
  });

  it("maps usage_update used/size and prompt-response billing meta", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-07-24T00:00:00.000Z",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "usage_update",
        used: 50_000,
        size: 500_000,
        cost: { amount: 0.12, currency: "USD" },
      } as never,
    });
    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Done" },
      },
    });
    mapper.complete("end_turn", 42, {
      stopReason: "end_turn",
      _meta: {
        totalTokens: 51_000,
        inputTokens: 800,
        outputTokens: 120,
        cachedReadTokens: 400,
      },
    });

    const usageEvents = events.filter(
      (event) => event.type === "usage.updated",
    );
    expect(usageEvents[0]).toMatchObject({
      usage: {
        contextTokensUsed: 50_000,
        contextWindowSize: 500_000,
        totalCostUsd: 0.12,
      },
    });
    expect(usageEvents.at(-1)).toMatchObject({
      usage: {
        inputTokens: 800,
        outputTokens: 120,
        cacheReadInputTokens: 400,
        contextTokensUsed: 51_000,
      },
    });

    const turnCompleted = events.find(
      (event) => event.type === "turn.completed",
    );
    expect(turnCompleted).toMatchObject({
      type: "turn.completed",
      durationMs: 42,
      usage: {
        inputTokens: 800,
        outputTokens: 120,
        cacheReadInputTokens: 400,
        contextTokensUsed: 51_000,
      },
    });
  });

  it("forwards native ACP session titles with compare-and-set metadata", () => {
    const events: AgentEvent[] = [];
    const mapper = new AcpEventMapper(
      "app-session-1",
      (event) => events.push(event),
      () => "2026-08-15T00:00:00.000Z",
      "Local fallback",
    );

    mapper.handle({
      sessionId: "provider-session-1",
      update: {
        sessionUpdate: "session_info_update",
        title: "Native ACP title",
      } as never,
    });

    expect(events).toContainEqual({
      type: "session.title.updated",
      sessionId: "app-session-1",
      title: "Native ACP title",
      expectedTitle: "Local fallback",
      updatedAt: "2026-08-15T00:00:00.000Z",
    });
  });
});
