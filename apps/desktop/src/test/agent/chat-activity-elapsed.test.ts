import { describe, expect, it } from "vitest";
import { formatElapsed } from "@/features/agent/view/chat-activity";

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
