import { sanitizeRendererLogPayload } from "@desktop/electron/logging/logger-utils";
import { describe, expect, it } from "vitest";

describe("sanitizeRendererLogPayload", () => {
  it("normalizes renderer log payloads", () => {
    const payload = sanitizeRendererLogPayload({
      details: {
        content: "hidden",
        line: 12,
      },
      event: "renderer.windowError",
      level: "not-a-level",
      scope: "",
    });

    expect(payload).toEqual({
      details: {
        content: "[redacted]",
        line: 12,
      },
      event: "renderer.windowError",
      level: "error",
      scope: "renderer",
    });
  });
});
