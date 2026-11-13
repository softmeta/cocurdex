import { getActivityState } from "@cocurdex/client-runtime";
import {
  type AgentToolCallRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

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
  it("reports tool activity when an ordinary tool is pending or running", () => {
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
    expect(activity?.activeToolCall?.id).toBe("run");
  });

  it("falls back to planning when only worktree setup is active", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [],
      toolCalls: [toolCall("setup", "in_progress", WORKTREE_SETUP_TOOL_KIND)],
    });

    expect(activity).toEqual({ kind: "planning", tone: "running" });
  });

  it("excludes previous-turn tools and worktree setup from motion", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [
        {
          attachments: [],
          content: "Continue",
          createdAt: "2026-10-07T00:00:01.000Z",
          id: "user",
          role: "user",
          seq: 2,
          sessionId: "session-1",
        },
      ],
      toolCalls: [
        { ...toolCall("old", "completed"), seq: 1 },
        {
          ...toolCall("setup", "completed", WORKTREE_SETUP_TOOL_KIND),
          seq: 3,
        },
      ],
    });
    expect(activity.toolActivityId).toBeUndefined();
  });

  it("reports completed tools from this turn even without an active snapshot", () => {
    const activity = getActivityState({
      isRunning: true,
      messages: [],
      toolCalls: [toolCall("fast-read", "completed")],
    });
    expect(activity.toolActivityId).toBe("fast-read");
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

    expect(activity).toEqual({
      kind: "responding",
      tone: "running",
      toolActivityId: "done",
    });
  });

  it.each([{ content: "   ", kind: "reasoning" as const }, { content: "   " }])(
    "keeps thinking for a non-response message: %j",
    (message) => {
      expect(
        getActivityState({
          isRunning: true,
          messages: [{ ...reply, ...message }],
          toolCalls: [],
        }),
      ).toEqual({ kind: "thinking", tone: "running" });
    },
  );

  it("returns to thinking once the reply text stops arriving mid-run", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [reply],
        responseStalled: true,
        toolCalls: [toolCall("done", "completed")],
      }),
    ).toEqual({ kind: "thinking", tone: "running", toolActivityId: "done" });
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
    ).toMatchObject({
      kind: "thinking",
      tone: "running",
      toolActivityId: "done",
    });
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
    ).toMatchObject({
      kind: "thinking",
      tone: "running",
      toolActivityId: "done",
    });
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
