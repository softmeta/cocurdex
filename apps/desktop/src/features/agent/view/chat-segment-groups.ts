import type { ConversationRenderSegment } from "./chat-timeline";

export function groupActivityWithFollowingItem(
  segments: ConversationRenderSegment[],
): ConversationRenderSegment[][] {
  const groups: ConversationRenderSegment[][] = [];

  for (const segment of segments) {
    const current = groups.at(-1);
    const joinsActivity =
      segment.kind === "item" &&
      current?.length === 1 &&
      current[0]?.kind === "activity";

    if (current && joinsActivity) {
      current.push(segment);
    } else {
      groups.push([segment]);
    }
  }

  return groups;
}

export function getSegmentKey(segment: ConversationRenderSegment | undefined) {
  if (segment?.kind === "item") {
    return segment.item.id;
  }
  return `activity:${segment?.items[0]?.id ?? ""}`;
}
