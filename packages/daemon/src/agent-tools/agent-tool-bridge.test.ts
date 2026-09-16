import { AGENT_TOOL_TOKEN_ENV, type SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AgentToolBridge } from "./agent-tool-bridge";

const session: SessionRecord = {
  id: "s-1",
  workspaceId: "w-1",
  title: "One",
  agentType: "codex",
  status: "idle",
  writeMode: "read-only",
  collaborationMode: "default",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastMessageAt: null,
};

function bridge() {
  return new AgentToolBridge({
    userDataPath: "/tmp/cocurdex",
    entryPath: "/app/daemon.cjs",
    execPath: "/usr/bin/node",
    execArgv: ["--import", "tsx"],
    getSession: async (sessionId) => (sessionId === "s-1" ? session : null),
  });
}

describe("AgentToolBridge", () => {
  it("issues a per-session token and a stdio spec that launches the subcommand", () => {
    const binding = bridge().bindingFor(session);
    expect(binding.stdio.command).toBe("/usr/bin/node");
    expect(binding.stdio.args).toEqual([
      "--import",
      "tsx",
      "/app/daemon.cjs",
      "agent-tools",
    ]);
    expect(binding.stdio.env[AGENT_TOOL_TOKEN_ENV]).toBe(binding.token);
  });

  it("resolves the caller from the token and rejects unknown or revoked tokens", async () => {
    const instance = bridge();
    const binding = instance.bindingFor(session);
    const catalog = await instance.catalog(binding.token);
    expect(catalog.caller).toEqual({
      sessionId: "s-1",
      sessionKind: "main",
      workspaceId: "w-1",
      teamId: null,
    });
    await expect(instance.catalog("nope")).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
    instance.revoke("s-1");
    await expect(instance.catalog(binding.token)).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
  });

  it("replaces the previous token when a session is rebound", async () => {
    const instance = bridge();
    const first = instance.bindingFor(session);
    const second = instance.bindingFor(session);
    await expect(instance.catalog(first.token)).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
    await expect(instance.catalog(second.token)).resolves.toBeDefined();
  });
});
