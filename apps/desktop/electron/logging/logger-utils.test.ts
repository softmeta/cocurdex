import { describe, expect, it } from "vitest";
import {
  formatErrorForLog,
  formatReadableLogLine,
  redactSensitiveText,
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

  it("redacts user-content and location field names", () => {
    const sanitized = sanitizeLogDetails({
      title: "My secret plan",
      prompt: "ignore previous instructions",
      fallbackTitle: "derived from user text",
      filePath: "/Users/alice/notes.md",
      folderPath: "/Users/alice/docs",
      workspaceRootPath: "/Users/alice/repo",
      baseUrl: "https://user:pass@internal.example.com/v1",
      cwd: "/Users/alice/repo",
      env: { HOME: "/Users/alice" },
      cookie: "session=abc",
      header: { authorization: "bearer x" },
      transcript: "hello",
      attachmentCount: 2,
      contentLength: 42,
      generatedTitleLength: 12,
      pathHash: "deadbeefcafe",
      workspaceHash: "0123456789ab",
      endpointHost: "api.example.com",
    });

    expect(sanitized).toEqual({
      title: "[redacted]",
      prompt: "[redacted]",
      fallbackTitle: "[redacted]",
      filePath: "[redacted]",
      folderPath: "[redacted]",
      workspaceRootPath: "[redacted]",
      baseUrl: "[redacted]",
      cwd: "[redacted]",
      env: "[redacted]",
      cookie: "[redacted]",
      header: "[redacted]",
      transcript: "[redacted]",
      attachmentCount: 2,
      contentLength: 42,
      generatedTitleLength: 12,
      pathHash: "deadbeefcafe",
      workspaceHash: "0123456789ab",
      endpointHost: "api.example.com",
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

  it("redacts home directory paths in free text", () => {
    expect(
      redactSensitiveText(
        "opened /Users/alice/project/file.ts and /users/alice/other",
        "/Users/alice",
      ),
    ).toBe("opened ~/project/file.ts and ~/other");
  });

  it("redacts windows home paths in plain and JSON-escaped forms", () => {
    const text =
      'path C:\\Users\\alice\\x and "C:\\\\Users\\\\alice\\\\y" and C:/Users/alice/z';
    expect(redactSensitiveText(text, "C:\\Users\\alice")).toBe(
      'path ~\\x and "~\\\\y" and ~/z',
    );
  });

  it("redacts common credential shapes in free text", () => {
    const text = [
      "key sk-ant-api03-aaaabbbbccccddddeeee",
      "token ghp_abcdefghij1234567890abcd",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fw",
      "aws AKIAIOSFODNN7EXAMPLE",
      "-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----",
    ].join(" ");

    const result = redactSensitiveText(text, "/nonexistent-home");
    expect(result).not.toContain("aaaabbbb");
    expect(result).not.toContain("abcdefghij");
    expect(result).not.toContain("eyJhbGci");
    expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result).not.toContain("abc123");
    expect(result.match(/\[redacted\]/g)).toHaveLength(5);
  });

  it("keeps non-credential text untouched", () => {
    const text = 'session.sessionStarted {"sessionId":"s-1","count":3}';
    expect(redactSensitiveText(text, "/nonexistent-home")).toBe(text);
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
