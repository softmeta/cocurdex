import { describe, expect, it } from "vitest";
import { formatElapsed } from "@/features/decks/presenter/format-elapsed";

describe("formatElapsed", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65)).toBe("01:05");
    expect(formatElapsed(3599)).toBe("59:59");
  });

  it("adds hours once the talk passes an hour", () => {
    expect(formatElapsed(3600)).toBe("1:00:00");
    expect(formatElapsed(3725)).toBe("1:02:05");
  });
});
