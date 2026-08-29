import type { AgentEvent, AgentMessageDeltaEvent } from "@cocurdex/shared";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { OpenCodeEventHandler } from "./opencode-event-handler";
import type {
  OpenCodeMessageSnapshot,
  OpenCodeSessionInfo,
  OpenCodeSessionSnapshot,
} from "./opencode-events";

function createHandler(
  events: AgentEvent[],
  resolveMessage?: (
    messageId: string,
  ) => Promise<OpenCodeMessageSnapshot | null>,
  resolveSession?: (
    sessionId: string,
  ) => Promise<OpenCodeSessionSnapshot | null>,
  resolveSessionInfo?: (
    sessionId: string,
  ) => Promise<OpenCodeSessionInfo | null>,
) {
  return new OpenCodeEventHandler({
    sessionId: "session-1",
    parentSession: {
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Parent session",
      agentType: "opencode",
      status: "running",
      writeMode: "read-only",
      collaborationMode: "default",
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: null,
    },
    isDisposed: () => false,
    getOpenCodeSessionId: () => "opencode-session-1",
    onEvent: (event) => events.push(event),
    resolveMessage,
    resolveSession,
    resolveSessionInfo,
  });
}

function opencodeEvent(
  type: string,
  properties: Record<string, unknown>,
): OpenCodeEvent {
  return { properties, type } as OpenCodeEvent;
}

function isMessageDeltaEvent(
  event: AgentEvent,
): event is AgentMessageDeltaEvent {
  return event.type === "message.delta";
}

describe("OpenCodeEventHandler", () => {
  it("emits completed assistant usage once as a context snapshot", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);
    const info = {
      id: "message-usage",
      role: "assistant",
      sessionID: "opencode-session-1",
      time: { created: 1, completed: 2 },
      cost: 0.02,
      tokens: {
        input: 100,
        output: 20,
        reasoning: 5,
        cache: { read: 40, write: 10 },
      },
    };

    handler.handleEvent(opencodeEvent("message.updated", { info }));
    handler.handleEvent(opencodeEvent("message.updated", { info }));

    expect(
      events.filter((event) => event.type === "usage.updated"),
    ).toMatchObject([
      {
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 40,
          cacheCreationInputTokens: 10,
          reasoningOutputTokens: 5,
          contextTokensUsed: 170,
          totalCostUsd: 0.02,
        },
      },
    ]);
  });

  it("does not log heartbeat events in debug diagnostics", () => {
    vi.stubEnv("COCURDEX_OPENCODE_DEBUG", "1");
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("server.heartbeat", {
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "assistant",
          sessionID: "opencode-session-1",
        },
      }),
    );

    expect(
      debugSpy.mock.calls.some(([message]) =>
        String(message).includes("server.heartbeat"),
      ),
    ).toBe(false);
    expect(
      debugSpy.mock.calls.some(([message]) =>
        String(message).includes("message.updated"),
      ),
    ).toBe(true);

    debugSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("surfaces provider auth failures from session.error", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("session.error", {
        sessionID: "opencode-session-1",
        error: {
          name: "ProviderAuthError",
          data: {
            providerID: "cocurdex",
            message: "Missing API key",
          },
        },
      }),
    );

    expect(events).toEqual([
      {
        type: "error",
        sessionId: "session-1",
        message: "ProviderAuthError (cocurdex): Missing API key",
      },
      {
        type: "state.changed",
        sessionId: "session-1",
        status: "error",
      },
    ]);
  });

  it("explains OpenCode database schema failures from session.error", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("session.error", {
        sessionID: "opencode-session-1",
        error: {
          name: "UnknownError",
          data: {
            message: "SQLiteError: no such column: replacement_seq",
          },
        },
      }),
    );

    expect(events[0]).toMatchObject({ type: "error" });
    expect(events[0]?.type === "error" && events[0].message).toContain(
      "OpenCode's local database schema is incompatible with this OpenCode server",
    );
  });

  it("ignores aborted session errors from user cancellation", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("session.error", {
        sessionID: "opencode-session-1",
        error: {
          name: "MessageAbortedError",
          data: { message: "aborted" },
        },
      }),
    );

    expect(events).toEqual([]);
  });

  it("resolves missing metadata for bare text deltas", async () => {
    const events: AgentEvent[] = [];
    const resolveMessage = vi.fn(async () => ({
      info: {
        id: "message-1",
        role: "assistant" as const,
        sessionID: "opencode-session-1",
      },
      parts: [
        {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "text",
        },
      ],
    }));
    const handler = createHandler(events, resolveMessage);

    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: "Hello",
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toEqual([]);

    await vi.waitFor(() => {
      expect(events.length).toBe(1);
    });

    expect(events).toMatchObject([
      {
        delta: "Hello",
        kind: "response",
        messageId: "message-1",
        sessionId: "session-1",
        type: "message.delta",
      },
    ]);
    expect(resolveMessage).toHaveBeenCalledWith("message-1");
  });

  it("does not duplicate resolved deltas when the snapshot contains full text", async () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events, async () => ({
      info: {
        id: "message-1",
        role: "assistant",
        sessionID: "opencode-session-1",
      },
      parts: [
        {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "Hello",
          type: "text",
        },
      ],
    }));

    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: "Hello",
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );

    await vi.waitFor(() => {
      expect(events.length).toBe(1);
    });

    expect(
      events.filter((event) => event.type === "message.delta"),
    ).toHaveLength(1);
  });

  it("uses resolved reasoning metadata for bare deltas", async () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events, async () => ({
      info: {
        id: "message-1",
        role: "assistant",
        sessionID: "opencode-session-1",
      },
      parts: [
        {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "reasoning",
        },
      ],
    }));

    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: "Checking files",
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );

    await vi.waitFor(() => {
      expect(events.length).toBe(1);
    });

    expect(events).toMatchObject([
      {
        delta: "Checking files",
        kind: "reasoning",
        messageId: "message-1:reasoning:part-1",
        sessionId: "session-1",
        type: "message.delta",
      },
    ]);
  });

  it("normalizes accumulated reasoning deltas", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);
    const first =
      "The task agent has provided a comprehensive analysis of the Jotai architecture.";
    const full = `${first} Now I need to synthesize this clearly.`;

    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "assistant",
          sessionID: "opencode-session-1",
        },
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "reasoning",
        },
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: first,
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: full,
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );

    const reasoningDeltas = events
      .filter(isMessageDeltaEvent)
      .map((event) => event.delta);

    expect(reasoningDeltas.join("")).toBe(full);
    expect(reasoningDeltas.join("")).not.toBe(`${first}${full}`);
  });

  it("ignores duplicated reasoning text from OpenCode snapshots", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);
    const text =
      "The task agent has provided a comprehensive analysis of the repository.";

    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "assistant",
          sessionID: "opencode-session-1",
        },
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: text,
          type: "reasoning",
        },
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: `${text}${text}`,
          type: "reasoning",
        },
        sessionID: "opencode-session-1",
      }),
    );

    const reasoningDeltas = events
      .filter(isMessageDeltaEvent)
      .map((event) => event.delta);

    expect(reasoningDeltas.join("")).toBe(text);
  });

  it("drops user text parts instead of rendering prompt echoes", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "Summarize this repo",
          type: "text",
        },
        sessionID: "opencode-session-1",
      }),
    );

    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "user",
          sessionID: "opencode-session-1",
        },
      }),
    );

    expect(events).toEqual([]);
  });

  it("keeps reasoning deltas separate when the delta carries part metadata", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "assistant",
          sessionID: "opencode-session-1",
        },
      }),
    );

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "reasoning",
        },
        sessionID: "opencode-session-1",
      }),
    );

    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: "Checking files",
        field: "text",
        messageID: "message-1",
        partID: "part-1",
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toMatchObject([
      {
        delta: "Checking files",
        kind: "reasoning",
        messageId: "message-1:reasoning:part-1",
        sessionId: "session-1",
        type: "message.delta",
      },
    ]);
  });

  it("emits tool call events from OpenCode tool parts", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          callID: "call-1",
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: { command: "ls -la" },
            status: "running",
            time: { start: 1_714_000_000_000 },
            title: "List files",
          },
          tool: "bash",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          callID: "call-1",
          id: "part-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: { command: "ls -la" },
            output: "total 0",
            status: "completed",
            time: { end: 1_714_000_001_000, start: 1_714_000_000_000 },
            title: "List files",
          },
          tool: "bash",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toMatchObject([
      {
        sessionId: "session-1",
        toolCall: {
          id: "part-1",
          kind: "bash",
          rawInput: { command: "ls -la" },
          startedAt: "2024-04-24T23:06:40.000Z",
          status: "in_progress",
          title: "List files",
        },
        type: "tool.started",
      },
      {
        sessionId: "session-1",
        toolCall: {
          id: "part-1",
          rawOutput: "total 0",
          startedAt: "2024-04-24T23:06:40.000Z",
          status: "completed",
          title: "List files",
          updatedAt: "2024-04-24T23:06:41.000Z",
        },
        type: "tool.finished",
      },
    ]);
  });

  it("hydrates tool calls from the message snapshot after text deltas", async () => {
    const events: AgentEvent[] = [];
    const resolveMessage = vi.fn(async () => ({
      info: {
        id: "message-1",
        role: "assistant" as const,
        sessionID: "opencode-session-1",
      },
      parts: [
        {
          id: "text-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "text",
        },
        {
          callID: "call-1",
          id: "tool-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: { filePath: "src/index.ts" },
            output: "export {}",
            status: "completed",
            time: { end: 1_714_000_001_000, start: 1_714_000_000_000 },
            title: "Read file",
          },
          tool: "read",
          type: "tool",
        },
      ],
    }));
    const handler = createHandler(events, resolveMessage);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "text-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          text: "",
          type: "text",
        },
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.updated", {
        info: {
          id: "message-1",
          role: "assistant",
          sessionID: "opencode-session-1",
        },
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.delta", {
        delta: "Done",
        field: "text",
        messageID: "message-1",
        partID: "text-1",
        sessionID: "opencode-session-1",
      }),
    );

    await vi.waitFor(() => {
      expect(events.some((event) => event.type === "tool.finished")).toBe(true);
    });

    expect(events).toMatchObject([
      {
        delta: "Done",
        messageId: "message-1",
        type: "message.delta",
      },
      {
        toolCall: {
          id: "tool-1",
          kind: "read",
          rawInput: { filePath: "src/index.ts" },
          rawOutput: "export {}",
          status: "completed",
          title: "Read file",
        },
        type: "tool.finished",
      },
    ]);
    expect(resolveMessage).toHaveBeenCalledTimes(1);
  });

  it("renders OpenCode task subagents as hydrated tool calls", async () => {
    const events: AgentEvent[] = [];
    const resolveSession = vi.fn(async () => ({
      sessionID: "child-session-1",
      messages: [
        {
          info: {
            id: "child-message-1",
            role: "user" as const,
            sessionID: "child-session-1",
          },
          parts: [
            {
              id: "child-text-1",
              messageID: "child-message-1",
              sessionID: "child-session-1",
              text: "Explore src",
              type: "text",
            },
          ],
        },
        {
          info: {
            id: "child-message-2",
            role: "assistant" as const,
            sessionID: "child-session-1",
          },
          parts: [
            {
              id: "child-text-2",
              messageID: "child-message-2",
              sessionID: "child-session-1",
              text: "Found the core files.",
              type: "text",
            },
            {
              id: "child-tool-1",
              messageID: "child-message-2",
              sessionID: "child-session-1",
              state: {
                input: { path: "src/index.ts" },
                output: "export {}",
                status: "completed",
                title: "Read file",
              },
              tool: "read",
              type: "tool",
            },
          ],
        },
      ],
    }));
    const handler = createHandler(events, undefined, resolveSession);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "task-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: { description: "Explore repository" },
            metadata: { sessionId: "child-session-1" },
            status: "running",
            title: "Task",
          },
          tool: "task",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    await vi.waitFor(() => {
      expect(resolveSession).toHaveBeenCalledWith("child-session-1");
      expect(
        events.some(
          (event) =>
            event.type === "message.completed" &&
            event.sessionId === "opencode-subagent:session-1:child-session-1" &&
            event.message.content === "Found the core files.",
        ),
      ).toBe(true);
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        session: expect.objectContaining({
          id: "opencode-subagent:session-1:child-session-1",
          parentSessionId: "session-1",
          parentToolCallId: "task-1",
          sessionKind: "subagent",
        }),
        sessionId: "opencode-subagent:session-1:child-session-1",
        type: "session.upserted",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        sessionId: "opencode-subagent:session-1:child-session-1",
        toolCall: expect.objectContaining({
          kind: "read",
          rawOutput: "export {}",
          title: "Read file",
        }),
        type: "tool.finished",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      toolCall: {
        id: "task-1",
        kind: "task",
        rawInput: {
          childSessionId: "opencode-subagent:session-1:child-session-1",
          description: "Explore repository",
          openCodeSessionId: "child-session-1",
        },
        rawOutput: null,
        title: "Using subagent",
      },
      type: "tool.started",
    });
  });

  it("preserves subagent transcript part order", async () => {
    const events: AgentEvent[] = [];
    const resolveSession = vi.fn(async () => ({
      sessionID: "child-session-1",
      messages: [
        {
          info: {
            id: "child-message-1",
            role: "assistant" as const,
            sessionID: "child-session-1",
          },
          parts: [
            {
              id: "reasoning-1",
              messageID: "child-message-1",
              sessionID: "child-session-1",
              text: "I will inspect the files.",
              type: "reasoning",
            },
            {
              id: "reasoning-2",
              messageID: "child-message-1",
              sessionID: "child-session-1",
              text: "Start with src.",
              type: "reasoning",
            },
            {
              id: "tool-1",
              messageID: "child-message-1",
              sessionID: "child-session-1",
              state: {
                input: { path: "src" },
                output: "src/index.ts",
                status: "completed",
                title: "List src",
              },
              tool: "list",
              type: "tool",
            },
            {
              id: "text-1",
              messageID: "child-message-1",
              sessionID: "child-session-1",
              text: "The source entry is in src/index.ts.",
              type: "text",
            },
          ],
        },
      ],
    }));
    const handler = createHandler(events, undefined, resolveSession);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "task-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: { description: "Explore repository" },
            metadata: { sessionId: "child-session-1" },
            status: "running",
            title: "Task",
          },
          tool: "task",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    await vi.waitFor(() => {
      expect(resolveSession).toHaveBeenCalledWith("child-session-1");
      expect(
        events.some(
          (event) =>
            event.type === "message.completed" &&
            event.sessionId === "opencode-subagent:session-1:child-session-1" &&
            event.message.content === "The source entry is in src/index.ts.",
        ),
      ).toBe(true);
    });

    const childTranscript = events.flatMap((event) => {
      if (event.sessionId !== "opencode-subagent:session-1:child-session-1") {
        return [];
      }

      if (event.type === "message.completed") {
        return [`${event.message.kind ?? "response"}:${event.message.content}`];
      }

      if (event.type === "tool.finished") {
        return [`tool:${event.toolCall.kind}`];
      }

      return [];
    });

    expect(childTranscript).toEqual([
      "reasoning:I will inspect the files.\n\nStart with src.",
      "tool:list",
      "response:The source entry is in src/index.ts.",
    ]);
  });

  it("emits a subagent tool call before OpenCode attaches child session metadata", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "task-1",
          messageID: "message-1",
          sessionID: "opencode-session-1",
          state: {
            input: {
              description: "Explore source code",
              subagent_type: "explore",
            },
            status: "running",
            title: "Explore source code",
          },
          tool: "task",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toMatchObject([
      {
        toolCall: {
          id: "task-1",
          kind: "task",
          rawInput: {
            description: "Explore source code",
            subagent_type: "explore",
          },
          status: "in_progress",
          title: "Using subagent",
        },
        type: "tool.started",
      },
    ]);
  });

  it("emits OpenCode subtask parts as subagent tool calls", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          agent: "explore",
          description: "Explore source code",
          id: "subtask-1",
          messageID: "message-1",
          prompt: "Inspect the repository",
          sessionID: "opencode-session-1",
          type: "subtask",
        },
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toMatchObject([
      {
        toolCall: {
          id: "subtask-1",
          kind: "task",
          rawInput: {
            description: "Explore source code",
            prompt: "Inspect the repository",
            subagent_type: "explore",
          },
          status: "in_progress",
          title: "Using subagent",
        },
        type: "tool.started",
      },
    ]);
  });

  it("reuses a subtask placeholder when the backing task tool starts", () => {
    const events: AgentEvent[] = [];
    const handler = createHandler(events);

    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          agent: "explore",
          description: "Explore source code",
          id: "subtask-1",
          messageID: "message-1",
          prompt: "Inspect the repository",
          sessionID: "opencode-session-1",
          type: "subtask",
        },
        sessionID: "opencode-session-1",
      }),
    );
    handler.handleEvent(
      opencodeEvent("message.part.updated", {
        part: {
          id: "task-tool-1",
          messageID: "assistant-1",
          sessionID: "opencode-session-1",
          state: {
            input: {
              description: "Explore source code",
              prompt: "Inspect the repository",
              subagent_type: "explore",
            },
            status: "running",
            title: "Explore source code",
          },
          tool: "task",
          type: "tool",
        },
        sessionID: "opencode-session-1",
      }),
    );

    expect(events).toMatchObject([
      {
        toolCall: {
          id: "subtask-1",
        },
        type: "tool.started",
      },
      {
        toolCall: {
          id: "subtask-1",
          kind: "task",
          title: "Using subagent",
        },
        type: "tool.started",
      },
    ]);
  });

  it("maps child session events to a subagent placeholder", async () => {
    const events: AgentEvent[] = [];
    const resolveSessionInfo = vi.fn(async () => ({
      id: "child-session-1",
      parentID: "opencode-session-1",
      title: "Explore source code (@explore subagent)",
    }));
    const handler = createHandler(
      events,
      undefined,
      undefined,
      resolveSessionInfo,
    );

    handler.handleEvent(
      opencodeEvent("session.status", {
        sessionID: "child-session-1",
        status: { type: "busy" },
      }),
    );

    await vi.waitFor(() => {
      expect(resolveSessionInfo).toHaveBeenCalledWith("child-session-1");
      expect(events.length).toBe(2);
    });

    expect(events).toMatchObject([
      {
        session: {
          id: "opencode-subagent:session-1:child-session-1",
          parentSessionId: "session-1",
          parentToolCallId: "opencode-subagent-child-session-1",
          sessionKind: "subagent",
        },
        sessionId: "opencode-subagent:session-1:child-session-1",
        type: "session.upserted",
      },
      {
        toolCall: {
          id: "opencode-subagent-child-session-1",
          kind: "task",
          rawInput: {
            childSessionId: "opencode-subagent:session-1:child-session-1",
            description: "Explore source code",
            openCodeSessionId: "child-session-1",
            subagent_type: "explore",
          },
          status: "in_progress",
          title: "Using subagent",
        },
        type: "tool.started",
      },
    ]);
  });
});
