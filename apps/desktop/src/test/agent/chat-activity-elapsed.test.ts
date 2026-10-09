import type { AgentToolCallRecord, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  getActivityState,
  isActivityHeaderBusy,
} from "@/features/agent/view/chat-activity-state";

describe("formatElapsed", () => {
  it("uses the completed-duration vocabulary", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(65_000)).toBe("1m 5s");
    expect(formatElapsed(4_325_000)).toBe("1h 12m");
  });

  it("counts whole elapsed seconds without rounding ahead", () => {
    expect(formatElapsed(7_900)).toBe("7s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("clamps clock skew to zero", () => {
    expect(formatElapsed(-500)).toBe("0s");
  });
});

describe("isActivityHeaderBusy", () => {
  it("stops the header shimmer after the run ends even if a tool stayed in flight", () => {
    expect(
      isActivityHeaderBusy({
        hasActiveToolCall: true,
        isLastSegment: true,
        isLiveConversation: false,
      }),
    ).toBe(false);
  });

  it("keeps the live tail shimmering while the conversation is still running", () => {
    expect(
      isActivityHeaderBusy({
        hasActiveToolCall: false,
        isLastSegment: true,
        isLiveConversation: true,
      }),
    ).toBe(true);
  });

  it("shimmers an earlier segment only while that conversation is live and a tool is active", () => {
    expect(
      isActivityHeaderBusy({
        hasActiveToolCall: true,
        isLastSegment: false,
        isLiveConversation: true,
      }),
    ).toBe(true);
    expect(
      isActivityHeaderBusy({
        hasActiveToolCall: false,
        isLastSegment: false,
        isLiveConversation: true,
      }),
    ).toBe(false);
  });
});

function assistant(seq: number, overrides: Partial<MessageRecord> = {}) {
  return {
    id: `m${seq}`,
    sessionId: "s",
    role: "assistant",
    kind: "response",
    content: "text",
    attachments: [],
    createdAt: "2026-10-06T00:00:00.000Z",
    seq,
    ...overrides,
  } satisfies MessageRecord;
}

function finishedTool(seq: number) {
  return {
    seq,
    status: "completed",
    startedAt: "2026-10-06T00:00:01.000Z",
  } as AgentToolCallRecord;
}

function runningKind(
  messages: MessageRecord[],
  toolCalls: AgentToolCallRecord[] = [],
) {
  return getActivityState({ isRunning: true, messages, toolCalls })?.kind;
}

describe("getActivityState", () => {
  it("reports thinking while the latest assistant output is reasoning", () => {
    expect(runningKind([assistant(1, { kind: "reasoning" })])).toBe("thinking");
  });

  it("reports responding while a response is streaming", () => {
    expect(runningKind([assistant(1)])).toBe("responding");
  });

  it("reports thinking after a tool finished past the latest response", () => {
    expect(runningKind([assistant(1)], [finishedTool(2)])).toBe("thinking");
  });

  it("reports thinking while the response is still empty", () => {
    expect(runningKind([assistant(1, { content: " " })])).toBe("thinking");
  });
});
