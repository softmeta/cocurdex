import type { AgentToolCallRecord, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  segmentConversationItems,
  type TimelineGroup,
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

function tools(id: string): TimelineGroup {
  return {
    id,
    kind: "toolCalls",
    toolCalls: [{ id, status: "completed" } as AgentToolCallRecord],
  };
}

function segmentIds(items: TimelineGroup[], foldInterimReplies: boolean) {
  return segmentConversationItems(items, true, foldInterimReplies).map(
    (segment) =>
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
    expect(segmentIds(turn, true)).toEqual([
      ["think", "interim-1", "tools-1", "interim-2", "tools-2"],
      "final",
    ]);
  });

  it("keeps interim replies between activity blocks when folding is off", () => {
    expect(segmentIds(turn, false)).toEqual([
      ["think"],
      "interim-1",
      ["tools-1"],
      "interim-2",
      ["tools-2"],
      "final",
    ]);
  });

  it("treats the last reply as final even when tool calls follow it", () => {
    expect(
      segmentIds([reply("a"), tools("t"), reply("b"), tools("u")], true),
    ).toEqual([["a", "t"], "b", ["u"]]);
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

    expect(withoutInterimReplies(items).map((item) => item.id)).toEqual([
      "think",
      "tools",
      "final",
    ]);
  });
});
