import {
  type AgentEvent,
  readContextCompactionDetails,
  type SessionRecord,
} from "@cocurdex/shared";
import type { OpenCodeEvent } from "@opencode/client";
import { describe, expect, it, vi } from "vitest";
import { OpenCodeTurn } from "./opencode-event-handler";

const ROOT = "ses_root";
const PROMPT = "msg_prompt";

const parentSession: SessionRecord = {
  id: "app-session",
  workspaceId: "workspace-1",
  title: "Session",
  agentType: "opencode",
  status: "running",
  writeMode: "native-write",
  sessionModeId: null,
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
  lastMessageAt: null,
  archivedAt: null,
};

let sequence = 0;

function event(type: string, data: Record<string, unknown>): OpenCodeEvent {
  sequence += 1;
  return {
    id: `evt_${sequence}`,
    created: 1_790_000_000_000 + sequence,
    type,
    data,
  } as unknown as OpenCodeEvent;
}

function delivered(sessionID = ROOT, inboxID = PROMPT) {
  return event("session.inbox.delivered", { sessionID, inboxID });
}

function createTurn() {
  const events: AgentEvent[] = [];
  const onPermissionAsked = vi.fn();
  const onFormCreated = vi.fn();
  const onTitle = vi.fn();
  const turn = new OpenCodeTurn({
    sessionId: parentSession.id,
    parentSession,
    openCodeSessionId: ROOT,
    promptId: PROMPT,
    onEvent: (agentEvent) => events.push(agentEvent),
    onPermissionAsked,
    onFormCreated,
    onTitle,
  });
  return { events, onFormCreated, onPermissionAsked, onTitle, turn };
}

describe("OpenCodeTurn", () => {
  it("ignores root output until the prompt is delivered", () => {
    const { events, turn } = createTurn();

    turn.handle(
      event("session.text.delta", {
        sessionID: ROOT,
        assistantMessageID: "msg_previous",
        ordinal: 0,
        delta: "stale",
      }),
    );
    turn.handle(delivered(ROOT, "msg_other"));
    expect(
      turn.handle(event("session.execution.succeeded", { sessionID: ROOT })),
    ).toBeNull();

    expect(events).toEqual([]);
    expect(turn.hasStarted).toBe(false);
  });

  it("streams assistant text and completes it when the execution succeeds", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    for (const delta of ["Hel", "lo"]) {
      turn.handle(
        event("session.text.delta", {
          sessionID: ROOT,
          assistantMessageID: "msg_a",
          ordinal: 0,
          delta,
        }),
      );
    }
    const outcome = turn.handle(
      event("session.execution.succeeded", { sessionID: ROOT }),
    );

    expect(outcome).toBe("succeeded");
    expect(events.map((agentEvent) => agentEvent.type)).toEqual([
      "message.delta",
      "message.delta",
      "message.completed",
      "state.changed",
    ]);
    expect(events[2]).toMatchObject({
      message: { id: "msg_a", content: "Hello", kind: "response" },
    });
    expect(events[3]).toMatchObject({ status: "idle" });
  });

  it("completes each assistant step as its own message", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.text.delta", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "First",
      }),
    );
    turn.handle(
      event("session.text.delta", {
        sessionID: ROOT,
        assistantMessageID: "msg_b",
        ordinal: 0,
        delta: "Second",
      }),
    );
    turn.handle(event("session.execution.succeeded", { sessionID: ROOT }));

    const completed = events.filter(
      (agentEvent) => agentEvent.type === "message.completed",
    );
    expect(completed).toMatchObject([
      { message: { id: "msg_a", content: "First" } },
      { message: { id: "msg_b", content: "Second" } },
    ]);
  });

  it("completes an assistant step when the step ends", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.text.delta", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "Editing now",
      }),
    );
    turn.handle(
      event("session.step.ended", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        finish: "tool-calls",
        cost: 0,
        tokens: {
          input: 1,
          output: 1,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }),
    );

    expect(events.map((agentEvent) => agentEvent.type)).toEqual([
      "message.delta",
      "message.completed",
      "usage.updated",
    ]);
  });

  it("keeps reasoning deltas separate from the response", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.reasoning.delta", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        ordinal: 1,
        delta: "Thinking",
      }),
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: "message.delta",
        messageId: "msg_a:reasoning:1",
        kind: "reasoning",
        delta: "Thinking",
      }),
    ]);
  });

  it("maps a tool from input to its result", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.tool.input.started", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_1",
        name: "read",
      }),
    );
    turn.handle(
      event("session.tool.called", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_1",
        input: { filePath: "README.md" },
        executed: true,
      }),
    );
    turn.handle(
      event("session.tool.success", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_1",
        content: [{ type: "text", text: "# Readme" }],
        executed: true,
      }),
    );

    expect(events).toMatchObject([
      { type: "tool.started", toolCall: { id: "call_1", status: "pending" } },
      {
        type: "tool.started",
        toolCall: {
          status: "in_progress",
          rawInput: { filePath: "README.md" },
        },
      },
      {
        type: "tool.finished",
        toolCall: {
          status: "completed",
          kind: "read",
          rawInput: { filePath: "README.md" },
          rawOutput: "# Readme",
        },
      },
    ]);
  });

  it("links a subagent tool to its child session transcript", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.tool.input.started", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_sub",
        name: "subagent",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "tool.started",
      toolCall: { title: "Using subagent", kind: "task", status: "pending" },
    });
    turn.handle(
      event("session.tool.called", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_sub",
        input: {
          agent: "explore",
          description: "Find tests",
          prompt: "List test files",
        },
        executed: true,
      }),
    );
    turn.handle(
      event("session.created", {
        sessionID: "ses_child",
        parentID: ROOT,
        title: "Find tests (@explore subagent)",
      }),
    );
    turn.handle(
      event("session.tool.progress", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_sub",
        metadata: { sessionID: "ses_child", status: "running" },
      }),
    );
    turn.handle(
      event("session.text.ended", {
        sessionID: "ses_child",
        assistantMessageID: "msg_child",
        ordinal: 0,
        text: "Found 3 files",
      }),
    );
    turn.handle(
      event("session.tool.success", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        id: "call_sub",
        content: [{ type: "text", text: "<subagent>...</subagent>" }],
        metadata: { sessionID: "ses_child", status: "completed" },
        executed: true,
      }),
    );

    const childSessionId = "opencode-subagent:app-session:ses_child";
    const sessions = events.filter(
      (agentEvent) => agentEvent.type === "session.upserted",
    );
    expect(sessions.at(0)).toMatchObject({
      session: {
        id: childSessionId,
        title: "Find tests (@explore subagent)",
        parentSessionId: "app-session",
        parentToolCallId: "call_sub",
        status: "running",
      },
    });
    expect(sessions.at(-1)).toMatchObject({ session: { status: "idle" } });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.completed",
        sessionId: childSessionId,
        message: expect.objectContaining({
          role: "user",
          content: "List test files",
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.completed",
        sessionId: childSessionId,
        message: expect.objectContaining({ content: "Found 3 files" }),
      }),
    );
    expect(events.at(-2)).toMatchObject({
      type: "tool.finished",
      toolCall: {
        id: "call_sub",
        kind: "task",
        status: "completed",
        rawOutput: null,
        subagent: {
          sessionId: childSessionId,
          type: "explore",
          description: "Find tests",
        },
      },
    });
  });

  it("routes permissions and forms from the root and its children", () => {
    const { onFormCreated, onPermissionAsked, turn } = createTurn();

    turn.handle(
      event("session.created", { sessionID: "ses_child", parentID: ROOT }),
    );
    turn.handle(
      event("permission.asked", {
        id: "per_1",
        sessionID: "ses_child",
        action: "edit",
        resources: ["src/a.ts"],
      }),
    );
    turn.handle(
      event("form.created", {
        form: { id: "frm_1", sessionID: ROOT, title: "Questions", fields: [] },
      }),
    );
    turn.handle(
      event("permission.asked", {
        id: "per_2",
        sessionID: "ses_unrelated",
        action: "edit",
        resources: [],
      }),
    );

    expect(onPermissionAsked).toHaveBeenCalledOnce();
    expect(onPermissionAsked.mock.calls[0]?.[0]).toMatchObject({
      id: "per_1",
    });
    expect(onFormCreated).toHaveBeenCalledOnce();
  });

  it("reports an execution failure with its structured error", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    const outcome = turn.handle(
      event("session.execution.failed", {
        sessionID: ROOT,
        error: { type: "provider.auth", message: "Invalid API key" },
      }),
    );

    expect(outcome).toBe("failed");
    expect(events).toEqual([
      {
        type: "error",
        sessionId: "app-session",
        message: "provider.auth: Invalid API key",
      },
      { type: "state.changed", sessionId: "app-session", status: "error" },
    ]);
  });

  it("treats aborted and interrupted executions as a quiet stop", () => {
    for (const terminal of [
      event("session.execution.failed", {
        sessionID: ROOT,
        error: { type: "aborted", message: "Aborted" },
      }),
      event("session.execution.interrupted", {
        sessionID: ROOT,
        reason: "user",
      }),
    ]) {
      const { events, turn } = createTurn();
      turn.handle(delivered());

      expect(turn.handle(terminal)).toBe("interrupted");
      expect(events).toEqual([
        { type: "state.changed", sessionId: "app-session", status: "idle" },
      ]);
    }
  });

  it("emits usage for each finished step", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.step.ended", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        finish: "stop",
        cost: 0.25,
        tokens: {
          input: 100,
          output: 20,
          reasoning: 5,
          cache: { read: 30, write: 10 },
        },
      }),
    );

    expect(events).toMatchObject([
      {
        type: "usage.updated",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 30,
          cacheCreationInputTokens: 10,
          reasoningOutputTokens: 5,
          contextTokensUsed: 160,
          totalCostUsd: 0.25,
        },
      },
    ]);
  });

  it("records automatic compaction with the context size before it", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.step.ended", {
        sessionID: ROOT,
        assistantMessageID: "msg_a",
        finish: "tool-calls",
        cost: 0,
        tokens: {
          input: 150_000,
          output: 2_000,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }),
    );
    turn.handle(
      event("session.compaction.started", {
        sessionID: ROOT,
        reason: "auto",
        recent: "",
      }),
    );
    turn.handle(
      event("session.compaction.ended", {
        sessionID: ROOT,
        reason: "auto",
        recent: "",
        text: "Summary",
      }),
    );

    const compactions = events.flatMap((agentEvent) =>
      agentEvent.type === "tool.started" || agentEvent.type === "tool.finished"
        ? [agentEvent.toolCall]
        : [],
    );
    expect(compactions.map((toolCall) => toolCall.status)).toEqual([
      "in_progress",
      "completed",
    ]);
    expect(
      readContextCompactionDetails({ rawInput: compactions[1]?.rawInput }),
    ).toMatchObject({
      trigger: "auto",
      tokensBefore: 152_000,
    });
  });

  it("marks failed compaction with the provider error", () => {
    const { events, turn } = createTurn();

    turn.handle(delivered());
    turn.handle(
      event("session.compaction.started", {
        sessionID: ROOT,
        reason: "manual",
        recent: "",
      }),
    );
    turn.handle(
      event("session.compaction.failed", {
        sessionID: ROOT,
        reason: "manual",
        error: { type: "provider", message: "context overflow" },
      }),
    );

    expect(events.at(-1)).toMatchObject({
      type: "tool.finished",
      toolCall: { status: "failed" },
    });
  });
});
