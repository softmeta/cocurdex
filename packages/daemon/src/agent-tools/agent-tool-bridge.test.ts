import type { SessionRecord } from "@cocurdex/shared";
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
});
