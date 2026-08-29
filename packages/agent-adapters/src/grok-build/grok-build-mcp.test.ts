import { describe, expect, it } from "vitest";
import {
  buildGrokMcpListParams,
  parseGrokBuildMcpServers,
} from "./grok-build-mcp";

describe("parseGrokBuildMcpServers", () => {
  it("maps session-annotated catalog rows to runtime statuses", () => {
    expect(
      parseGrokBuildMcpServers({
        result: {
          servers: [
            {
              name: "context7",
              session: { enabled: true, status: "ready" },
            },
            {
              name: "context-mode",
              session: { enabled: true, status: "initializing" },
            },
            {
              name: "linear",
              session: { enabled: false, status: "ready" },
            },
            {
              name: "sentry",
              session: { enabled: true, status: "unavailable" },
            },
            {
              name: "github",
              session: { enabled: true, authRequired: true, status: "ready" },
            },
            {
              name: "catalog-only",
            },
          ],
        },
      }),
    ).toEqual([
      { name: "context7", status: "connected" },
      { name: "context-mode", status: "connecting" },
      { name: "linear", status: "disabled" },
      { name: "sentry", status: "failed" },
      { name: "github", status: "failed" },
      { name: "catalog-only", status: "unknown" },
    ]);
  });

  it("reads an unwrapped payload and skips nameless rows", () => {
    expect(
      parseGrokBuildMcpServers({
        servers: [
          { name: "context7", session: { status: "ready" } },
          { session: { status: "ready" } },
          { name: "" },
        ],
      }),
    ).toEqual([{ name: "context7", status: "connected" }]);
  });

  it("keeps the existing list when the catalog is missing", () => {
    expect(parseGrokBuildMcpServers({ result: {} })).toBeNull();
    expect(parseGrokBuildMcpServers(null)).toBeNull();
  });

  it("treats an empty catalog as no configured servers", () => {
    expect(parseGrokBuildMcpServers({ result: { servers: [] } })).toEqual([]);
  });
});

describe("buildGrokMcpListParams", () => {
  it("asks for the session-annotated cached catalog", () => {
    expect(buildGrokMcpListParams("grok-session-1")).toEqual({
      cache: true,
      sessionId: "grok-session-1",
    });
  });
});
