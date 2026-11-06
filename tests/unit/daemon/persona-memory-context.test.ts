import { mergeRecallResults } from "@cocurdex/daemon/internal/memory/partition-recall";
import { personaMemoryBrief } from "@cocurdex/daemon/internal/memory/persona-memory";
import type { MemoryEntry, MemoryRecallItem } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function item(id: string): MemoryRecallItem {
  return {
    id,
    title: `Title ${id}`,
    score: 0.8,
    importance: "important",
    updatedAt: null,
  };
}

function entry(id: string, content: string): MemoryEntry {
  return {
    ...item(id),
    content,
    kind: "preference",
    project: "cocurdex/me",
    tags: [],
    parentId: null,
    createdAt: null,
    device: "fixture/linux",
  };
}

describe("personal memory context", () => {
  it("includes complete facts and their source within the shared Unicode budget", () => {
    const facts = new Map([
      ["short", entry("short", "The user prefers tea.")],
      ["large", entry("large", "😀".repeat(2000))],
    ]);
    const context = personaMemoryBrief([item("short"), item("large")], facts);
    expect(context).toContain("The user prefers tea.");
    expect(context).toContain("fixture/linux");
    expect(context).toContain("Title large");
    expect(context).not.toContain("😀");
    expect([...(context ?? "")].length).toBeLessThanOrEqual(1500);
  });

  it("retains successful partition results while reporting another partition's failure", () => {
    const result = mergeRecallResults(
      [
        { query: "tea", items: [item("me")], truncated: false, error: null },
        {
          query: "tea",
          items: [],
          truncated: false,
          error: "Private partition unavailable",
        },
      ],
      6,
    );
    expect(result.items.map((value) => value.id)).toEqual(["me"]);
    expect(result.error).toBe("Private partition unavailable");
  });
});
