import { describe, expect, it } from "vitest";
import { mergeCodexMcpServers, parseCodexMcpServerStatus } from "./codex-mcp";

describe("codex MCP startup status", () => {
  it("parses a startup status notification", () => {
    expect(
      parseCodexMcpServerStatus({
        threadId: "t1",
        name: "context7",
        status: "ready",
        error: null,
        failureReason: null,
      }),
    ).toEqual({ name: "context7", status: "ready" });
  });

  it("ignores payloads without a name or status", () => {
    expect(parseCodexMcpServerStatus({ threadId: "t1" })).toBeNull();
    expect(parseCodexMcpServerStatus(null)).toBeNull();
  });

  it("appends unknown servers and replaces changed ones in place", () => {
    const starting = mergeCodexMcpServers([], {
      name: "context7",
      status: "starting",
    });
    const withSecond = mergeCodexMcpServers(starting, {
      name: "context-mode",
      status: "starting",
    });
    const ready = mergeCodexMcpServers(withSecond, {
      name: "context7",
      status: "ready",
    });

    expect(ready).toEqual([
      { name: "context7", status: "ready" },
      { name: "context-mode", status: "starting" },
    ]);
  });
});
