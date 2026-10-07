import {
  type AgentToolCallRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  getActivityState,
  getShownToolCallChangeDelay,
} from "./chat-activity-state";

function toolCall(
  id: string,
  status: AgentToolCallRecord["status"],
  kind: string | null = "execute",
): AgentToolCallRecord {
  return {
    content: [],
    id,
    kind,
    locations: [],
    sessionId: "session-1",
    startedAt: "2026-10-07T00:00:00.000Z",
    status,
    title: id,
    updatedAt: "2026-10-07T00:00:00.000Z",
  };
}

describe("getActivityState", () => {
  it("reports every active tool call except worktree setup", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [],
      toolCalls: [
        toolCall("done", "completed"),
        toolCall("setup", "in_progress", WORKTREE_SETUP_TOOL_KIND),
        toolCall("read", "pending"),
        toolCall("run", "in_progress"),
      ],
    });

    expect(activity?.kind).toBe("usingTools");
    expect(activity?.activeToolCalls?.map((call) => call.id)).toEqual([
      "read",
      "run",
    ]);
  });

  it("falls back to planning when only worktree setup is active", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [],
      toolCalls: [toolCall("setup", "in_progress", WORKTREE_SETUP_TOOL_KIND)],
    });

    expect(activity).toEqual({ kind: "planning", tone: "running" });
  });
});

describe("getShownToolCallChangeDelay", () => {
  const shownRead = { at: 1_000, toolCall: toolCall("read", "in_progress") };

  it("waits before revealing a newly active tool call", () => {
    expect(
      getShownToolCallChangeDelay({
        activeToolCallId: "read",
        now: 1_000,
        shown: null,
      }),
    ).toBe(400);
  });

  it("keeps a revealed tool call visible for the minimum duration", () => {
    expect(
      getShownToolCallChangeDelay({
        activeToolCallId: null,
        now: 1_300,
        shown: shownRead,
      }),
    ).toBe(500);
    expect(
      getShownToolCallChangeDelay({
        activeToolCallId: "run",
        now: 1_300,
        shown: shownRead,
      }),
    ).toBe(500);
  });

  it("hides a finished tool call at once after the minimum duration", () => {
    expect(
      getShownToolCallChangeDelay({
        activeToolCallId: null,
        now: 3_000,
        shown: shownRead,
      }),
    ).toBe(0);
  });

  it("does nothing while the shown tool call is still active", () => {
    expect(
      getShownToolCallChangeDelay({
        activeToolCallId: "read",
        now: 1_300,
        shown: shownRead,
      }),
    ).toBeNull();
  });
});

describe("getActivityState while replying", () => {
  const reply = {
    attachments: [],
    content: "Reading the orchestrator",
    createdAt: "2026-10-07T00:00:01.000Z",
    id: "reply",
    role: "assistant" as const,
    sessionId: "session-1",
  };

  it("keeps a running state while the reply text streams", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [reply],
      toolCalls: [toolCall("done", "completed")],
    });

    expect(activity).toEqual({ kind: "responding", tone: "running" });
  });

  it.each([
    { content: "Reasoning", kind: "reasoning" as const },
    { content: "   " },
  ])("keeps thinking for a non-response message: %j", (message) => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [{ ...reply, ...message }],
        toolCalls: [],
      }),
    ).toEqual({ kind: "thinking", tone: "running" });
  });

  it("returns to thinking after a tool follows the reply", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [reply],
        toolCalls: [
          {
            ...toolCall("done", "completed"),
            startedAt: "2026-10-07T00:00:02.000Z",
          },
        ],
      }),
    ).toEqual({ kind: "thinking", tone: "running" });
  });

  it("uses event sequence when reply and tool timestamps match", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [{ ...reply, seq: 1 }],
        toolCalls: [
          {
            ...toolCall("done", "completed"),
            seq: 2,
            startedAt: reply.createdAt,
          },
        ],
      }),
    ).toEqual({ kind: "thinking", tone: "running" });
  });

  it("marks the reply complete when the run ends", () => {
    expect(
      getActivityState({
        isRunning: false,
        messages: [reply],
        toolCalls: [],
      }),
    ).toEqual({ kind: "completed", tone: "complete" });
  });
});
