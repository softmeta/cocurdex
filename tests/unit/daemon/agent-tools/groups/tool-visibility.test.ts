import { registerHistoryTools } from "@cocurdex/daemon/internal/agent-tools/groups/history";
import { registerMessagingTools } from "@cocurdex/daemon/internal/agent-tools/groups/messaging";
import { registerScriptRunTools } from "@cocurdex/daemon/internal/agent-tools/groups/script-run";
import { registerSettingsTools } from "@cocurdex/daemon/internal/agent-tools/groups/settings";
import {
  registerTeamTools,
  type TeamToolDependencies,
} from "@cocurdex/daemon/internal/agent-tools/groups/team";
import { AgentToolRegistry } from "@cocurdex/daemon/internal/agent-tools/tool-registry";
import type { AgentToolCallerContext } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function registry() {
  const tools = new AgentToolRegistry();
  const unused = async () => {
    throw new Error("not called");
  };
  registerMessagingTools(tools, { listPeers: unused, sendPeerMessage: unused });
  registerTeamTools(
    tools,
    new Proxy({}, { get: () => unused }) as TeamToolDependencies,
  );
  registerScriptRunTools(tools, { create: unused });
  registerHistoryTools(tools, { readSessionActivity: unused });
  registerSettingsTools(tools, {
    getWorktreeEnvironment: unused,
    proposeWorktreeEnvironment: unused,
    getSettingValue: unused,
    setSettingValue: unused,
  });
  return tools;
}

function toolNames(sessionKind: AgentToolCallerContext["sessionKind"]) {
  return registry()
    .catalog({ sessionId: "s", sessionKind, workspaceId: "w", teamId: null })
    .tools.map((tool) => `${tool.group}_${tool.name}`);
}

describe("agent tool visibility", () => {
  it("gives subagents no coordination tools so they cannot fan out or recurse", () => {
    expect(toolNames("subagent")).toEqual([]);
  });

  it("lets only main sessions propose script runs", () => {
    expect(toolNames("main")).toContain("script_run_propose");
    expect(toolNames("teammate")).not.toContain("script_run_propose");
    expect(toolNames("teammate")).toContain("messaging_send_message");
  });

  it("lets only main sessions inspect and propose settings", () => {
    expect(toolNames("main")).toEqual(
      expect.arrayContaining([
        "settings_list",
        "settings_get",
        "settings_propose",
        "settings_set",
      ]),
    );
    expect(toolNames("teammate")).not.toContain("settings_propose");
    expect(toolNames("teammate")).not.toContain("settings_get");
    expect(toolNames("subagent")).not.toContain("settings_list");
  });

  it("lets main sessions and teammates read their own history back", () => {
    expect(toolNames("main")).toContain("history_read");
    expect(toolNames("teammate")).toContain("history_read");
  });
});
