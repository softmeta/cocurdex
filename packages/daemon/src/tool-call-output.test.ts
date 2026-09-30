import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  capToolCallOutput,
  TOOL_OUTPUT_EDGE_CHARS,
  withoutToolCallOutput,
} from "./tool-call-output";

function toolCall(
  overrides: Partial<AgentToolCallRecord> = {},
): AgentToolCallRecord {
  return {
    id: "tool-1",
    sessionId: "session-1",
    title: "Run command",
    status: "completed",
    content: [],
    rawInput: { command: "ls" },
    locations: [],
    startedAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:01.000Z",
    ...overrides,
  };
}

const edge = TOOL_OUTPUT_EDGE_CHARS;
const long = `${"a".repeat(edge)}${"m".repeat(500)}${"z".repeat(edge)}`;

describe("capToolCallOutput", () => {
  it("keeps the head and tail of long text and reports the omitted length", () => {
    const [item] =
      capToolCallOutput(toolCall({ content: [{ type: "text", text: long }] }))
        .content ?? [];

    expect(item?.type).toBe("text");
    const text = item?.type === "text" ? item.text : "";
    expect(text.startsWith("a".repeat(edge))).toBe(true);
    expect(text.endsWith("z".repeat(edge))).toBe(true);
    expect(text).toContain("500 characters truncated");
    expect(text).not.toContain("m");
  });

  it("caps strings nested in data items and raw output", () => {
    const capped = capToolCallOutput(
      toolCall({
        content: [{ type: "data", value: { stdout: long, code: 0 } }],
        rawOutput: { output: [long], exitCode: 1 },
      }),
    );

    expect(capped.content).toEqual([
      {
        type: "data",
        value: { stdout: expect.stringContaining("truncated"), code: 0 },
      },
    ]);
    expect(capped.rawOutput).toEqual({
      output: [expect.stringContaining("truncated")],
      exitCode: 1,
    });
  });

  it("leaves short output, diffs, and input untouched", () => {
    const diff = { type: "diff" as const, path: "a.ts", newText: long };
    const original = toolCall({
      content: [{ type: "text", text: "short" }, diff],
      rawInput: { command: long },
      rawOutput: "short",
    });

    const capped = capToolCallOutput(original);

    expect(capped.content).toEqual([{ type: "text", text: "short" }, diff]);
    expect(capped.rawInput).toBe(original.rawInput);
    expect(capped.rawOutput).toBe("short");
  });
});

describe("withoutToolCallOutput", () => {
  it("drops the result fields so the record becomes a summary", () => {
    const summary = withoutToolCallOutput(
      toolCall({
        content: [{ type: "text", text: "output" }],
        rawOutput: { output: "output" },
      }),
    );

    expect(summary.content).toBeUndefined();
    expect("rawOutput" in summary).toBe(false);
    expect(summary.rawInput).toEqual({ command: "ls" });
  });
});
