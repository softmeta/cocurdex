import type { McpImportCandidate } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { importableAgentSummary } from "@/features/settings/mcp/mcp-import-items";

function candidate(
  overrides: Partial<McpImportCandidate> & Pick<McpImportCandidate, "name">,
): McpImportCandidate {
  return {
    source: "claude",
    sourcePath: "/config/claude.json",
    config: { command: "npx" },
    match: "new",
    disabledInSource: false,
    unsupported: null,
    ...overrides,
  };
}

describe("importableAgentSummary", () => {
  it("counts each importable server name once and lists agents in scan order", () => {
    const summary = importableAgentSummary([
      candidate({ name: "github", source: "cursor" }),
      candidate({ name: "github", source: "claude" }),
      candidate({ name: "linear", source: "claude-project" }),
      candidate({ name: "sentry", source: "antigravity" }),
    ]);

    expect(summary).toEqual({
      count: 3,
      agents: ["cursor", "claude", "antigravity"],
    });
  });

  it("skips servers that are already added or cannot be imported", () => {
    const summary = importableAgentSummary([
      candidate({ name: "github", match: "same" }),
      candidate({ name: "linear", match: "different", source: "cursor" }),
      candidate({ name: "bad name", unsupported: "invalid name" }),
    ]);

    expect(summary).toEqual({ count: 0, agents: [] });
  });
});
