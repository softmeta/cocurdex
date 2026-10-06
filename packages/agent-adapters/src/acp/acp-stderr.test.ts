import { describe, expect, it } from "vitest";
import { appendStderrTail, sanitizeStderrExcerpt } from "./acp-stderr";

describe("appendStderrTail", () => {
  it("keeps only the newest output once the tail is full", () => {
    const tail = appendStderrTail("a".repeat(4_000), "b".repeat(200));

    expect(tail).toHaveLength(4_096);
    expect(tail.endsWith("b".repeat(200))).toBe(true);
  });
});

describe("sanitizeStderrExcerpt", () => {
  const env = { HOME: "/Users/alice" };

  it("masks the home directory and credentials", () => {
    const excerpt = sanitizeStderrExcerpt(
      [
        "reading /Users/alice/.agent/config.json",
        "Authorization: Bearer abc.def-123",
        "using key sk-proj-ABCDEFGHIJKL",
        "callback https://login.example.com/cb?code=s3cret&state=1",
        "API_KEY=hunter2",
      ].join("\n"),
      env,
    );

    expect(excerpt).toBe(
      [
        "reading ~/.agent/config.json",
        "Authorization: Bearer [redacted]",
        "using key [redacted]",
        "callback https://login.example.com/cb?code=[redacted]&state=1",
        "API_KEY=[redacted]",
      ].join("\n"),
    );
  });

  it("keeps the last lines of a long log and drops blank ones", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index}`);
    const excerpt = sanitizeStderrExcerpt(`${lines.join("\n\n")}\n`, env);

    expect(excerpt.split("\n")).toEqual(lines.slice(-12));
  });
});
