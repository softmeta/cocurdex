import {
  type AgentToolCallRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  getActivityState,
  getReasoningHeadline,
  getShownStepChangeDelay,
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

  it("shows the latest reasoning headline while thinking", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [
          {
            ...reply,
            content: "**Inspecting events**\n\nThe adapter maps items.",
            kind: "reasoning",
          },
        ],
        toolCalls: [],
      }),
    ).toEqual({
      kind: "thinking",
      latestStep: { headline: "Inspecting events", kind: "reasoning" },
      tone: "running",
    });
  });

  it("replaces the reasoning headline with the tool that followed it", () => {
    const finished = {
      ...toolCall("read", "completed"),
      startedAt: "2026-10-07T00:00:02.000Z",
    };
    expect(
      getActivityState({
        isRunning: true,
        messages: [{ ...reply, content: "**Planning**", kind: "reasoning" }],
        toolCalls: [finished],
      }),
    ).toEqual({
      kind: "thinking",
      latestStep: { kind: "toolCall", toolCall: finished },
      tone: "running",
      toolActivityId: "read",
    });
  });

  it("shows reasoning that arrives after the latest tool", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [
          {
            ...reply,
            content: "**Checking limits**",
            createdAt: "2026-10-07T00:00:03.000Z",
            kind: "reasoning",
          },
        ],
        toolCalls: [
          {
            ...toolCall("read", "completed"),
            startedAt: "2026-10-07T00:00:02.000Z",
          },
        ],
      }),
    ).toMatchObject({
      latestStep: { headline: "Checking limits", kind: "reasoning" },
    });
  });

  it("ignores reasoning from earlier turns", () => {
    expect(
      getActivityState({
        isRunning: true,
        messages: [
          { ...reply, content: "**Old**", kind: "reasoning" },
          { ...reply, content: "Next", id: "user", role: "user" },
        ],
        toolCalls: [],
      }),
    ).toEqual({ kind: "planning", tone: "running" });
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

describe("getReasoningHeadline", () => {
  it.each([
    ["**Inspecting events**", "Inspecting events"],
    ["Intro\n\n## Reading config\n", "Reading config"],
    ["**Done** with setup", "Done with setup"],
    ["Checking the adapter.\nThen the view.", "Then the view."],
    ["**Checking tests**\n\n**Half", "Checking tests"],
    ["Line\r\n<!-- hidden -->\r\n", "Line"],
    ["  \n", null],
  ])("reads %j as %j", (content, headline) => {
    expect(getReasoningHeadline(content)).toBe(headline);
  });
});

describe("getShownStepChangeDelay", () => {
  const shown = { at: 1_000, key: "reasoning:Inspecting sync" };

  it("shows the first step at once", () => {
    expect(
      getShownStepChangeDelay({
        activeKey: "toolCall:read",
        now: 1_000,
        shown: null,
      }),
    ).toBe(0);
  });

  it("keeps the shown step until the active one changes", () => {
    expect(
      getShownStepChangeDelay({ activeKey: shown.key, now: 9_000, shown }),
    ).toBeNull();
  });

  it("holds a shown step for the minimum duration before replacing it", () => {
    expect(
      getShownStepChangeDelay({
        activeKey: "toolCall:read",
        now: 1_400,
        shown,
      }),
    ).toBe(1_100);
    expect(
      getShownStepChangeDelay({
        activeKey: "toolCall:read",
        now: 3_000,
        shown,
      }),
    ).toBe(0);
  });
});
