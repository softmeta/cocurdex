import type { SessionRecord, TeamRoster } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AgentToolBridge } from "./agent-tool-bridge";

const session: SessionRecord = {
  id: "s-1",
  workspaceId: "w-1",
  title: "One",
  agentType: "codex",
  status: "idle",
  writeMode: "read-only",
  sessionModeId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastMessageAt: null,
};

function bridge(url: string | null = "http://127.0.0.1:4000/mcp") {
  return new AgentToolBridge({
    url,
    getSession: async (sessionId) => (sessionId === "s-1" ? session : null),
  });
}

function bind(instance: AgentToolBridge) {
  const bound = instance.bind(session);
  if (!bound) throw new Error("expected a binding");
  return bound;
}

describe("AgentToolBridge", () => {
  it("binds nothing when the daemon has no agent tool endpoint", () => {
    expect(bridge(null).bind(session)).toBeNull();
  });

  it("issues a per-session token for the shared endpoint", () => {
    const { binding } = bind(bridge());
    expect(binding.url).toBe("http://127.0.0.1:4000/mcp");
    expect(binding.token).toMatch(/^[0-9a-f]{48}$/);
  });

  it("resolves the caller from the token and rejects unknown or revoked tokens", async () => {
    const instance = bridge();
    const { binding, invoker } = bind(instance);
    const expectedCaller = {
      sessionId: "s-1",
      sessionKind: "main",
      workspaceId: "w-1",
      teamId: null,
    };
    expect((await instance.catalog(binding.token)).caller).toEqual(
      expectedCaller,
    );
    expect((await invoker.catalog()).caller).toEqual(expectedCaller);
    await expect(instance.catalog("nope")).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
    instance.revoke("s-1");
    await expect(invoker.catalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
  });

  it("replaces the previous token when a session is rebound", async () => {
    const instance = bridge();
    const first = bind(instance);
    const second = bind(instance);
    await expect(first.invoker.catalog()).rejects.toMatchObject({
      code: "UNAUTHORIZED_AGENT_TOOL",
    });
    await expect(second.invoker.catalog()).resolves.toBeDefined();
  });

  it("gives a lead the roster of its team as instructions", async () => {
    const roster: TeamRoster = {
      templateId: "tpl-1",
      name: "Review squad",
      description: null,
      leadPrompt: "",
      members: [
        { name: "reviewer", agentRoleId: "role-1", prompt: "Review PRs." },
      ],
    };
    const instance = new AgentToolBridge({
      url: "http://127.0.0.1:4000/mcp",
      getSession: async (sessionId) => (sessionId === "s-1" ? session : null),
      getTeamId: async () => "team-1",
      getLeadRoster: async () => roster,
    });
    const { invoker } = bind(instance);

    const { instructions } = await invoker.catalog();

    expect(instructions).toContain('Your team is "Review squad"');
    expect(instructions).toContain("- reviewer: Review PRs.");
  });

  it("gives no instructions without a roster or delegation tools", async () => {
    const { invoker } = bind(bridge());
    expect((await invoker.catalog()).instructions).toBeUndefined();
  });
});
