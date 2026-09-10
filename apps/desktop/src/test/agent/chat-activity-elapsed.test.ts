import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  isActivityHeaderBusy,
} from "@/features/agent/view/chat-activity";

describe("formatElapsed", () => {
  it("pads seconds and keeps counting minutes past an hour", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7_400)).toBe("0:07");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(4_325_000)).toBe("72:05");
  });

  it("clamps clock skew to zero", () => {
    expect(formatElapsed(-500)).toBe("0:00");
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
