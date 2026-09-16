import type { AgentToolCallerContext } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AgentToolRegistry } from "../tool-registry";
import { registerMessagingTools } from "./messaging";
import { registerScriptRunTools } from "./script-run";
import { registerTeamTools, type TeamToolDependencies } from "./team";

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
});
