import { describe, expect, it } from "vitest";
import { errorKindForLog, hashLogValue, hostForLog } from "./logging";

describe("hashLogValue", () => {
  it("returns null for empty input", () => {
    expect(hashLogValue(null)).toBeNull();
    expect(hashLogValue(undefined)).toBeNull();
    expect(hashLogValue("")).toBeNull();
  });

  it("is stable and does not contain the input", () => {
    const value = "/Users/alice/secret-project";
    const hash = hashLogValue(value);
    expect(hash).toBe(hashLogValue(value));
    expect(hash).not.toBe(hashLogValue("/Users/alice/other-project"));
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
    expect(String(hash)).not.toContain("alice");
  });
});

describe("hostForLog", () => {
  it("returns null for empty input", () => {
    expect(hostForLog(null)).toBeNull();
    expect(hostForLog(undefined)).toBeNull();
    expect(hostForLog("")).toBeNull();
  });

  it("keeps host and port while dropping path and query", () => {
    expect(
      hostForLog("https://api.example.com:8443/v1/chat?api_key=secret"),
    ).toBe("api.example.com:8443");
  });

  it("drops userinfo credentials", () => {
    expect(hostForLog("https://user:pass@example.com/path")).toBe(
      "example.com",
    );
  });

  it("handles custom schemes", () => {
    expect(hostForLog("cocu-pdf://local/file.pdf")).toBe("local");
  });

  it("marks unparsable input without echoing it", () => {
    expect(hostForLog("not a url with secrets")).toBe("[unparsable-url]");
  });
});

describe("errorKindForLog", () => {
  it("classifies abort errors by name and message", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(errorKindForLog(abort)).toBe("aborted");
    expect(errorKindForLog("Request aborted")).toBe("aborted");
  });

  it("classifies common failure shapes", () => {
    expect(errorKindForLog(new Error("fetch failed"))).toBe("network");
    expect(errorKindForLog(new Error("connect ECONNREFUSED"))).toBe("network");
    expect(errorKindForLog(new Error("HTTP 401 unauthorized"))).toBe("auth");
    expect(errorKindForLog(new Error("429 too many requests"))).toBe(
      "rateLimited",
    );
    expect(errorKindForLog(new Error("request timed out"))).toBe("timeout");
    expect(errorKindForLog(new Error("ENOENT: no such file"))).toBe("notFound");
    expect(errorKindForLog(new Error("EACCES: permission denied"))).toBe(
      "permission",
    );
    expect(errorKindForLog(new SyntaxError("Unexpected token"))).toBe("parse");
  });

  it("does not misclassify ECONNABORTED as a user abort", () => {
    expect(errorKindForLog(new Error("socket ECONNABORTED"))).toBe("network");
  });

  it("falls back to unknown", () => {
    expect(errorKindForLog(new Error("something odd happened"))).toBe(
      "unknown",
    );
    expect(errorKindForLog(42)).toBe("unknown");
  });
});
