import { pageSessionActivity } from "@cocurdex/daemon/internal/agent-tools/groups/history";
import type { HandoffItem } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function item(position: number, text = `item ${position}`): HandoffItem {
  return {
    id: `i${position}`,
    sessionId: "s1",
    position,
    role: position % 2 ? "user" : "assistant",
    kind: "message",
    agent: null,
    text,
  };
}

const items = [1, 2, 3, 4, 5].map((position) => item(position));

describe("pageSessionActivity", () => {
  it("pages newest first by window and walks both directions", () => {
    const newest = pageSessionActivity(items, { limit: 2 });
    expect(newest).toMatchObject({
      totalItems: 5,
      olderBeforePosition: 4,
      newerAfterPosition: null,
    });
    expect(newest.items?.map((entry) => entry.position)).toEqual([4, 5]);

    const forward = pageSessionActivity(items, { afterPosition: 1, limit: 2 });
    expect(forward.items?.map((entry) => entry.position)).toEqual([2, 3]);
    expect(forward.newerAfterPosition).toBe(3);
  });

  it("reads one long item in slices with a continuation offset", () => {
    const long = [item(1, "a".repeat(250) + "b".repeat(50))];
    const first = pageSessionActivity(long, {
      itemId: "i1",
      maxCharsPerItem: 250,
    });
    expect(first.item).toMatchObject({ textLength: 300, nextTextOffset: 250 });
    const rest = pageSessionActivity(long, { itemId: "i1", textOffset: 250 });
    expect(rest.item).toMatchObject({
      text: "b".repeat(50),
      nextTextOffset: null,
    });
  });

  it("marks page items whose text was shortened", () => {
    const page = pageSessionActivity([item(1, "x".repeat(300))], {
      maxCharsPerItem: 200,
    });
    expect(page.items?.[0]).toMatchObject({ truncated: true, textLength: 300 });
  });
});
