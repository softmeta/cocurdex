import { describe, expect, it } from "vitest";
import {
  getSegmentGroupKey,
  groupActivityWithFollowingItem,
} from "@/features/agent/view/chat-segment-groups";
import type {
  ConversationRenderSegment,
  TimelineGroup,
} from "@/features/agent/view/chat-timeline";

function item(id: string): ConversationRenderSegment {
  return { kind: "item", item: { id } as TimelineGroup };
}

function activity(id: string): ConversationRenderSegment {
  return { kind: "activity", items: [{ id } as TimelineGroup] };
}

function groupIds(segments: ConversationRenderSegment[]) {
  return groupActivityWithFollowingItem(segments).map((group) =>
    group.map((segment) =>
      segment.kind === "item"
        ? segment.item.id
        : `activity:${segment.items[0]?.id}`,
    ),
  );
}

describe("groupActivityWithFollowingItem", () => {
  it("pairs each activity header with the reply that follows it", () => {
    expect(
      groupIds([
        activity("a1"),
        item("r1"),
        activity("a2"),
        item("r2"),
        activity("a3"),
      ]),
    ).toEqual([["activity:a1", "r1"], ["activity:a2", "r2"], ["activity:a3"]]);
  });

  it("keeps items that do not follow an activity header in their own groups", () => {
    expect(
      groupIds([item("r0"), activity("a1"), item("r1"), item("r2")]),
    ).toEqual([["r0"], ["activity:a1", "r1"], ["r2"]]);
  });
});

it("preserves the answer group identity when completion folds earlier work", () => {
  const live = groupActivityWithFollowingItem([
    item("interim"),
    activity("tool"),
    item("answer"),
  ]);
  const completed = groupActivityWithFollowingItem([
    activity("interim"),
    item("answer"),
  ]);
  expect(getSegmentGroupKey(live.at(-1) ?? [])).toBe(
    getSegmentGroupKey(completed[0]),
  );
  expect(getSegmentGroupKey([item("answer")])).toBe(
    getSegmentGroupKey(completed[0]),
  );
});
