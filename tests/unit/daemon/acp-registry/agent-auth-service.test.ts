import {
  type AgentAuthProvider,
  AgentAuthService,
} from "@cocurdex/daemon/internal/acp-registry/agent-auth-service";
import type { AcpRegistryInstalledAgent } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

const agentId = "acp:antigravity" as const;

function createService(options: {
  authMethodId?: string;
  liveSessionIds?: string[];
  login?: AgentAuthProvider["login"];
}) {
  const events: string[] = [];
  const installed = {
    agentId,
    authMethodId: options.authMethodId,
  } as unknown as AcpRegistryInstalledAgent;
  const registry = {
    listInstalled: vi.fn(() => [installed]),
    setAuthMethod: vi.fn(async (_agentId: string, methodId: string | null) => {
      events.push(`persist:${methodId}`);
    }),
  };
  const provider: AgentAuthProvider = {
    login:
      options.login ??
      vi.fn(async (_agentId, methodId) => {
        events.push(`login:${methodId}`);
      }),
    cancelLogin: vi.fn(() => true),
    logout: vi.fn(async () => {
      events.push("logout");
    }),
    read: vi.fn(async () => ({
      methods: [],
      loginMethodId: null,
      logoutSupported: true,
    })),
  };
  const service = new AgentAuthService({
    registry,
    provider,
    liveSessionIds: () => options.liveSessionIds ?? [],
    disposeSession: async (sessionId) => {
      events.push(`stop:${sessionId}`);
    },
  });
  return { events, registry, service };
}

describe("AgentAuthService", () => {
  it("stops live sessions before switching the login method and persists it after", async () => {
    const { events, service } = createService({
      authMethodId: "oauth-personal",
      liveSessionIds: ["s1"],
    });

    await service.login({ agentId, methodId: "gemini-api-key" });

    expect(events).toEqual([
      "stop:s1",
      "login:gemini-api-key",
      "persist:gemini-api-key",
    ]);
  });

  it("keeps the previous method when switching fails", async () => {
    const { registry, service } = createService({
      authMethodId: "oauth-personal",
      login: vi.fn(async () => {
        throw new Error("denied");
      }),
    });

    await expect(
      service.login({ agentId, methodId: "gemini-api-key" }),
    ).rejects.toThrow("denied");
    expect(registry.setAuthMethod).not.toHaveBeenCalled();
  });

  it("re-authenticates with the current method without stopping sessions", async () => {
    const { events, service } = createService({
      authMethodId: "oauth-personal",
      liveSessionIds: ["s1"],
    });

    await service.login({ agentId, methodId: "oauth-personal" });

    expect(events).toEqual(["login:oauth-personal"]);
  });

  it("stops live sessions before logging out", async () => {
    const { events, service } = createService({ liveSessionIds: ["s1", "s2"] });

    await service.logout(agentId);

    expect(events).toEqual(["stop:s1", "stop:s2", "logout"]);
  });

  it("refuses login for agents without ACP sign-in", async () => {
    const { service } = createService({});

    await expect(service.login({ agentId: "codex" })).rejects.toThrow(
      "does not support login",
    );
  });

  it("reports the preferred method and live session count", async () => {
    const { service } = createService({
      authMethodId: "oauth-personal",
      liveSessionIds: ["s1"],
    });

    await expect(service.read(agentId)).resolves.toMatchObject({
      preferredMethodId: "oauth-personal",
      liveSessionCount: 1,
    });
  });
});
