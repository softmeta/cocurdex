import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { summarizeActivity } from "./activity-summary";
import type { TimelineGroup } from "./chat-timeline";

function toolCall(
  id: string,
  kind: string,
  overrides: Partial<AgentToolCallRecord> = {},
): AgentToolCallRecord {
  return {
    content: [],
    id,
    kind,
    locations: [],
    sessionId: "session",
    startedAt: "2026-10-09T00:00:00.000Z",
    status: "completed",
    title: id,
    updatedAt: "2026-10-09T00:00:00.000Z",
    ...overrides,
  };
}

function tools(...toolCalls: AgentToolCallRecord[]): TimelineGroup {
  return { id: toolCalls[0]?.id ?? "tools", kind: "toolCalls", toolCalls };
}

function reasoning(id: string): TimelineGroup {
  return {
    id,
    kind: "message",
    message: {
      attachments: [],
      content: "thinking",
      createdAt: "2026-10-09T00:00:00.000Z",
      id,
      kind: "reasoning",
      role: "assistant",
      sessionId: "session",
    },
  };
}

describe("summarizeActivity", () => {
  it("counts tool calls by what they did, in the order they first ran", () => {
    expect(
      summarizeActivity([
        tools(toolCall("r1", "read"), toolCall("r2", "read")),
        reasoning("think"),
        tools(toolCall("c1", "execute"), toolCall("r3", "read")),
      ]),
    ).toEqual({
      kind: "actions",
      actions: [
        { action: "read", count: 3 },
        { action: "command", count: 1 },
      ],
      otherCount: 0,
    });
  });

  it("names the two most telling actions and counts the rest", () => {
    expect(
      summarizeActivity([
        tools(
          toolCall("s1", "search"),
          toolCall("r1", "read"),
          toolCall("e1", "edit", {
            locations: [{ path: "/repo/a.ts" }],
          }),
          toolCall("e2", "edit", {
            locations: [{ path: "/repo/a.ts" }],
          }),
          toolCall("c1", "execute"),
          toolCall("x1", "think"),
        ),
      ]),
    ).toEqual({
      kind: "actions",
      actions: [
        { action: "edit", count: 1 },
        { action: "command", count: 1 },
      ],
      otherCount: 3,
    });
  });

  it("falls back to a generic tool count when nothing is recognized", () => {
    expect(
      summarizeActivity([tools(toolCall("a", "mcp"), toolCall("b", "mcp"))]),
    ).toEqual({
      kind: "actions",
      actions: [{ action: "other", count: 2 }],
      otherCount: 0,
    });
  });

  it("summarizes reasoning-only work as thinking", () => {
    expect(summarizeActivity([reasoning("a"), reasoning("b")])).toEqual({
      kind: "reasoning",
      count: 2,
    });
  });
});
