import {
  type AgentToolCallRecord,
  type MessageRecord,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  createTimelineGroups,
  segmentConversationItems,
  type TimelineGroup,
  type TurnPhase,
  withoutInterimReplies,
} from "./chat-timeline";

function reply(id: string, kind?: MessageRecord["kind"]): TimelineGroup {
  return {
    id,
    kind: "message",
    message: {
      attachments: [],
      content: `${id} text`,
      createdAt: "2026-09-29T00:00:00.000Z",
      id,
      kind,
      role: "assistant",
      sessionId: "session",
    },
  };
}

function tools(
  id: string,
  status: AgentToolCallRecord["status"] = "completed",
): TimelineGroup {
  return {
    id,
    kind: "toolCalls",
    toolCalls: [{ id, status } as AgentToolCallRecord],
  };
}

function segmentIds(items: TimelineGroup[], phase: TurnPhase) {
  return segmentConversationItems(items, true, phase).map((segment) =>
    segment.kind === "item"
      ? segment.item.id
      : segment.items.map((item) => item.id),
  );
}

describe("segmentConversationItems", () => {
  const turn = [
    reply("think", "reasoning"),
    reply("interim-1"),
    tools("tools-1"),
    reply("interim-2"),
    tools("tools-2"),
    reply("final"),
  ];

  it("folds interim replies into one activity block before the final reply", () => {
    expect(segmentIds(turn, "completed")).toEqual([
      ["think", "interim-1", "tools-1", "interim-2", "tools-2"],
      "final",
    ]);
  });

  it("keeps interim replies between activity blocks when folding is off", () => {
    expect(segmentIds(turn, "live")).toEqual([
      ["think"],
      "interim-1",
      ["tools-1"],
      "interim-2",
      ["tools-2"],
      "final",
    ]);
  });

  it("folds completed tool calls after the final reply into the turn's work", () => {
    expect(
      segmentIds([reply("a"), tools("t"), reply("b"), tools("u")], "completed"),
    ).toEqual([["a", "t", "u"], "b"]);
  });

  it("keeps failed tool calls after the final reply visible", () => {
    expect(
      segmentIds([tools("t"), reply("b"), tools("u", "failed")], "completed"),
    ).toEqual([["t"], "b", ["u"]]);
  });

  it("folds a stopped turn into one block when work ran after its last reply", () => {
    expect(
      segmentIds(
        [reply("plan"), tools("t"), tools("u", "in_progress")],
        "interrupted",
      ),
    ).toEqual([["plan", "t", "u"]]);
  });

  it("keeps the partial answer of a turn stopped while replying", () => {
    expect(segmentIds([tools("t"), reply("partial")], "interrupted")).toEqual([
      ["t"],
      "partial",
    ]);
  });

  it("leaves trailing tool calls in place while the turn is live", () => {
    expect(segmentIds([tools("t"), reply("b"), tools("u")], "live")).toEqual([
      ["t"],
      "b",
      ["u"],
    ]);
  });
});

describe("withoutInterimReplies", () => {
  it("drops interim replies and keeps process items and the final reply", () => {
    const items = [
      reply("think", "reasoning"),
      reply("interim"),
      tools("tools"),
      reply("final"),
    ];

    expect(
      withoutInterimReplies(items, "completed").map((item) => item.id),
    ).toEqual(["think", "tools", "final"]);
  });
});

describe("worktree setup in the timeline", () => {
  function toolCall(
    id: string,
    seq: number,
    kind: string | null,
  ): AgentToolCallRecord {
    return {
      content: [],
      id,
      kind,
      locations: [],
      seq,
      sessionId: "session",
      startedAt: "2026-10-04T00:00:00.000Z",
      status: "completed",
      title: id,
      updatedAt: "2026-10-04T00:00:00.000Z",
    };
  }

  it("stands apart from the agent's tool calls and activity block", () => {
    const groups = createTimelineGroups(
      [],
      [
        toolCall("setup", 1, WORKTREE_SETUP_TOOL_KIND),
        toolCall("read", 2, "read"),
      ],
    );

    expect(groups.map((group) => group.kind)).toEqual([
      "worktreeSetup",
      "toolCalls",
    ]);
    expect(segmentIds(groups, "completed")).toEqual([
      "worktree-setup-setup",
      ["tool-group-read"],
    ]);
  });
});
