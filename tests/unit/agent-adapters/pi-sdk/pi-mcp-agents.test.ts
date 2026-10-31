import { onlyPiMcpServers } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-mcp-agents";
import { describe, expect, it } from "vitest";

function entry(
  name: string,
  config: Record<string, unknown>,
  scope = "global",
) {
  return { name, config, source: "mcp.json", scope } as never;
}

describe("onlyPiMcpServers", () => {
  it("keeps servers targeting Pi and project servers, drops the rest", () => {
    const loaded = {
      servers: [
        entry("legacy", { command: "a" }),
        entry("shared", {
          command: "b",
          cocurdex: { agents: ["pi", "codex"] },
        }),
        entry("claude-only", {
          command: "c",
          cocurdex: { agents: ["claude-agent"] },
        }),
        entry("repo", { command: "d" }, "project"),
      ],
      errors: [],
    };
    expect(
      onlyPiMcpServers(loaded).servers.map((server) => server.name),
    ).toEqual(["legacy", "shared", "repo"]);
  });
});
