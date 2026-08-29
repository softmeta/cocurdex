import { describe, expect, it } from "vitest";
import {
  formatErrorForLog,
  formatReadableLogLine,
  sanitizeLogDetails,
  sanitizeRendererLogPayload,
} from "./logger-utils";

describe("logger sanitization", () => {
  it("redacts sensitive nested fields", () => {
    const sanitized = sanitizeLogDetails({
      apiKey: "secret-key",
      nested: {
        content: "user prompt",
        safeCount: 2,
      },
      rawInput: { command: "cat private-file" },
      tokenValue: "token",
    });

    expect(sanitized).toEqual({
      apiKey: "[redacted]",
      nested: {
        content: "[redacted]",
        safeCount: 2,
      },
      rawInput: "[redacted]",
      tokenValue: "[redacted]",
    });
  });

  it("handles circular values without throwing", () => {
    const value: Record<string, unknown> = { count: 1 };
    value.self = value;

    expect(sanitizeLogDetails(value)).toEqual({
      count: 1,
      self: "[circular]",
    });
  });

  it("formats errors without losing the error message", () => {
    const error = new Error("HTTP 401 authorization: bearer abc123");

    expect(formatErrorForLog(error)).toMatchObject({
      message: "HTTP 401 authorization: bearer [redacted]",
      name: "Error",
    });
  });

  it("formats development log lines for humans without dropping details", () => {
    expect(
      formatReadableLogLine({
        details: { sessionId: "session-1", title: "hello" },
        event: "session.created",
        level: "info",
        scope: "session",
        timestamp: "2026-08-03T06:16:32.925Z",
      }),
    ).toBe(
      '2026-08-03 06:16:32.925Z INFO  [session] session.created {"sessionId":"session-1","title":"hello"}',
    );
  });

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
