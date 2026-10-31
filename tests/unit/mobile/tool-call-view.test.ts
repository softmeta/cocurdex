import {
  toolCallDurationMs,
  toolCallInputText,
  toolCallOutputPlaceholder,
  toolCallOutputTail,
  toolCallResultSource,
} from "@cocurdex/mobile/internal/session-detail/tool-call-view";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function call(overrides: Partial<AgentToolCallRecord>): AgentToolCallRecord {
  return {
    id: "tool-1",
    sessionId: "session-1",
    title: "Run command",
    kind: "execute",
    status: "completed",
    content: undefined,
    locations: [],
    startedAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:12.400Z",
    ...overrides,
  };
}

describe("toolCallInputText", () => {
  it("shows a command as the command line itself", () => {
    expect(
      toolCallInputText(call({ rawInput: { command: "pnpm test", cwd: "." } })),
    ).toBe("pnpm test");
  });

  it("shows other input as formatted JSON", () => {
    expect(toolCallInputText(call({ rawInput: { path: "a.ts" } }))).toBe(
      JSON.stringify({ path: "a.ts" }, null, 2),
    );
    expect(toolCallInputText(call({ rawInput: undefined }))).toBeNull();
  });
});

describe("toolCallResultSource", () => {
  it("uses the record's own result when it carries one", () => {
    const record = call({
      content: [{ type: "text", text: "inline" }],
      rawOutput: null,
    });
    expect(toolCallResultSource(record, undefined)).toEqual({
      content: [{ type: "text", text: "inline" }],
      rawOutput: null,
    });
  });

  it("falls back to the lazily loaded result for summary records", () => {
    const loaded = { content: [], rawOutput: "lazy" };
    expect(toolCallResultSource(call({}), loaded)).toBe(loaded);
    expect(toolCallResultSource(call({}), undefined)).toBeNull();
  });
});

describe("toolCallOutputTail", () => {
  it("keeps the end of long output and says it was cut", () => {
    const result = {
      content: [{ type: "text" as const, text: "head-middle-tail" }],
      rawOutput: null,
    };
    expect(toolCallOutputTail(result, 4)).toEqual({
      text: "tail",
      truncated: true,
    });
    expect(toolCallOutputTail(result)).toEqual({
      text: "head-middle-tail",
      truncated: false,
    });
    expect(toolCallOutputTail(null)).toBeNull();
  });
});

describe("toolCallDurationMs", () => {
  it("measures finished calls only", () => {
    expect(toolCallDurationMs(call({}))).toBe(12_400);
    expect(toolCallDurationMs(call({ status: "in_progress" }))).toBeNull();
  });
});

describe("toolCallOutputPlaceholder", () => {
  it("waits for a result only while it is being fetched", () => {
    expect(toolCallOutputPlaceholder(true, { data: undefined })).toBe(
      "loading",
    );
    expect(
      toolCallOutputPlaceholder(true, {
        data: undefined,
        error: new Error("offline"),
      }),
    ).toBe("failed");
    expect(toolCallOutputPlaceholder(true, { data: null })).toBe("none");
    expect(toolCallOutputPlaceholder(false, { data: undefined })).toBe("none");
  });
});
