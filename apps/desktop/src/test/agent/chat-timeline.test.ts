import type { AgentToolCallRecord, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  createTimelineGroups,
  segmentConversationItems,
  type TimelineGroup,
} from "@/features/agent/view/chat-timeline";

function toolCall(id: string, kind: string): AgentToolCallRecord {
  return {
    id,
    sessionId: "session-1",
    title: kind,
    kind,
    status: "completed",
    content: [],
    rawInput: null,
    rawOutput: null,
    locations: [],
    startedAt: `2026-05-20T00:00:0${id}.000Z`,
    updatedAt: `2026-05-20T00:00:0${id}.000Z`,
  };
}

function assistantMessage(id: string): MessageRecord {
  return {
    id,
    sessionId: "session-1",
    role: "assistant",
    kind: "response",
    content: `message-${id}`,
    attachments: [],
    createdAt: `2026-05-20T00:00:0${id}.000Z`,
  } as unknown as MessageRecord;
}

function toolKinds(groups: ReturnType<typeof createTimelineGroups>) {
  return groups.map((group) =>
    group.kind === "toolCalls"
      ? group.toolCalls.map((tool) => tool.kind)
      : group.kind,
  );
}

describe("createTimelineGroups", () => {
  it("merges all consecutive non-subagent tool calls into one group", () => {
    const groups = createTimelineGroups(
      [],
      [
        toolCall("1", "read"),
        toolCall("2", "grep"),
        toolCall("3", "bash"),
        toolCall("4", "list"),
        toolCall("5", "edit"),
        toolCall("6", "glob"),
      ],
    );

    expect(toolKinds(groups)).toEqual([
      ["read", "grep", "bash", "list", "edit", "glob"],
    ]);
  });

  it("keeps subagent (task) tool calls as standalone groups", () => {
    const groups = createTimelineGroups(
      [],
      [
        toolCall("1", "read"),
        toolCall("2", "task"),
        toolCall("3", "grep"),
        toolCall("4", "bash"),
      ],
    );

    expect(toolKinds(groups)).toEqual([["read"], ["task"], ["grep", "bash"]]);
  });

  it("breaks tool-call groups when a message interleaves", () => {
    const groups = createTimelineGroups(
      [assistantMessage("3")],
      [toolCall("1", "read"), toolCall("2", "grep"), toolCall("5", "bash")],
    );

    expect(toolKinds(groups)).toEqual([["read", "grep"], "message", ["bash"]]);
  });
});

function reasoningMessage(id: string): MessageRecord {
  return {
    ...assistantMessage(id),
    kind: "reasoning",
  } as MessageRecord;
}

const toolGroup = (id: string): TimelineGroup => ({
  id,
  kind: "toolCalls",
  toolCalls: [toolCall(id, "read")],
});
const reasoningItem = (id: string): TimelineGroup => ({
  id,
  kind: "message",
  message: reasoningMessage(id),
});
const answerItem = (id: string): TimelineGroup => ({
  id,
  kind: "message",
  message: assistantMessage(id),
});

describe("segmentConversationItems", () => {
  it("returns every item unwrapped when not condensed", () => {
    const items = [reasoningItem("1"), toolGroup("2"), answerItem("3")];

    expect(segmentConversationItems(items, false)).toEqual(
      items.map((item) => ({ kind: "item", item })),
    );
  });

  it("folds a contiguous reasoning + tool run into one activity segment", () => {
    const items = [
      reasoningItem("1"),
      toolGroup("2"),
      reasoningItem("3"),
      toolGroup("4"),
      answerItem("5"),
    ];

    const segments = segmentConversationItems(items, true);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ kind: "activity" });
    expect(
      segments[0].kind === "activity"
        ? segments[0].items.map((item) => item.id)
        : [],
    ).toEqual(["1", "2", "3", "4"]);
    expect(segments[1]).toEqual({ kind: "item", item: answerItem("5") });
  });

  it("folds a lone process item into an activity segment", () => {
    const items = [toolGroup("1"), answerItem("2")];

    const segments = segmentConversationItems(items, true);

    expect(segments).toEqual([
      { kind: "activity", items: [toolGroup("1")] },
      { kind: "item", item: answerItem("2") },
    ]);
  });
});
