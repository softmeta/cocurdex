import { describe, expect, it } from "vitest";
import { isLongUserMessageText } from "./collapsible-user-message";

describe("isLongUserMessageText", () => {
  it("keeps a short prompt expanded", () => {
    expect(isLongUserMessageText("Fix the login button alignment.")).toBe(
      false,
    );
  });

  it("keeps a ten-line prompt expanded", () => {
    const lines = Array.from({ length: 10 }, (_, index) => `step ${index + 1}`);
    expect(isLongUserMessageText(lines.join("\n"))).toBe(false);
  });

  it("collapses an eleven-line paste", () => {
    const lines = Array.from({ length: 11 }, (_, index) => `step ${index + 1}`);
    expect(isLongUserMessageText(lines.join("\n"))).toBe(true);
  });

  it("treats CRLF as a single line break", () => {
    const lines = Array.from({ length: 11 }, (_, index) => `step ${index + 1}`);
    expect(isLongUserMessageText(lines.join("\r\n"))).toBe(true);
  });

  it("collapses a long single-paragraph paste", () => {
    expect(isLongUserMessageText("a".repeat(721))).toBe(true);
    expect(isLongUserMessageText("a".repeat(720))).toBe(false);
  });
});
