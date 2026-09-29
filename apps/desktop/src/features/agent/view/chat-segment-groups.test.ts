import { describe, expect, it } from "vitest";
import { groupActivityWithFollowingItem } from "./chat-segment-groups";
import type { ConversationRenderSegment, TimelineGroup } from "./chat-timeline";

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
