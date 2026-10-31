import { describe, expect, it } from "vitest";
import {
  mcpAgentRows,
  toggleMcpAgent,
} from "@/features/settings/mcp/mcp-agent-rows";

describe("mcpAgentRows", () => {
  it("explains which agents can receive a server", () => {
    const rows = mcpAgentRows(
      ["pi", "claude-agent", "codex", "opencode"],
      ["pi", "codex"],
      null,
    );
    expect(
      rows.map(({ agentId, checked, access, toggleable }) => [
        agentId,
        checked,
        access.kind,
        toggleable,
      ]),
    ).toEqual([
      ["pi", true, "native", true],
      ["claude-agent", false, "injected", true],
      ["codex", true, "injected", true],
      ["opencode", false, "injected", true],
    ]);
  });

  it("keeps Pi-only servers off other agents but lets stale assignments be removed", () => {
    const rows = mcpAgentRows(["pi", "codex"], ["codex", "acp:gone"], "cwd");
    expect(rows).toEqual([
      {
        agentId: "pi",
        checked: false,
        access: { kind: "native" },
        toggleable: true,
      },
      {
        agentId: "codex",
        checked: true,
        access: { kind: "serverUnsupported", reason: "cwd" },
        toggleable: true,
      },
      {
        agentId: "acp:gone",
        checked: true,
        access: { kind: "serverUnsupported", reason: "cwd" },
        toggleable: true,
      },
    ]);
    expect(mcpAgentRows(["claude-agent"], [], "cwd")[0].toggleable).toBe(false);
  });

  it("toggles an agent without duplicates", () => {
    expect(toggleMcpAgent(["pi"], "codex", true)).toEqual(["pi", "codex"]);
    expect(toggleMcpAgent(["pi", "codex"], "codex", true)).toEqual([
      "pi",
      "codex",
    ]);
    expect(toggleMcpAgent(["pi", "codex"], "pi", false)).toEqual(["codex"]);
  });
});
