import type { AgentAdapter } from "@cocurdex/agent-core";
import { createAgentRegistry } from "@cocurdex/agent-core";
import type { AgentCapabilityCacheRepository } from "@cocurdex/db";
import type { AgentDescriptor } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_CAPABILITY_CACHE_TTL_MS,
  discoverAgentSessionModes,
  discoverInstalledAgentCapabilities,
} from "./agent-capability-discovery";

function memoryCache(): AgentCapabilityCacheRepository {
  const entries = new Map<
    string,
    { capabilities: Record<string, unknown>; probedAt: string }
  >();
  return {
    async get(agentId, version) {
      const entry = entries.get(`${agentId}\0${version}`);
      return entry
        ? {
            capabilities: entry.capabilities as never,
            probedAt: entry.probedAt,
          }
        : null;
    },
    async set(agentId, version, entry) {
      entries.set(`${agentId}\0${version}`, {
        capabilities: entry.capabilities as Record<string, unknown>,
        probedAt: entry.probedAt,
      });
    },
  };
}

function installedAgent(
  overrides: Partial<AgentDescriptor> = {},
): AgentDescriptor {
  const descriptor = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "devin");
  if (!descriptor) {
    throw new Error("Devin descriptor is missing");
  }
  return {
    ...descriptor,
    installation: {
      executableName: "devin",
      executablePath: "/usr/local/bin/devin",
      version: "3000.10.31",
    },
    ...overrides,
  };
}

describe("discoverInstalledAgentCapabilities", () => {
  it("merges capabilities reported by an installed agent adapter", async () => {
    const claudeCli = createAgentRegistry()
      .list()
      .find((agent) => agent.id === "claude-agent");
    if (!claudeCli) {
      throw new Error("Claude Agent descriptor is missing");
    }
    const discoverCapabilities = vi.fn(async () => ({
      capabilities: {
        permissionModes: [
          { id: "claude-default" as const, risk: "normal" as const },
          { id: "claude-auto" as const, risk: "elevated" as const },
        ],
      },
      version: "2.1.220 (Claude Code)",
    }));
    const createAdapter = vi.fn(
      () =>
        ({
          discoverCapabilities,
        }) as unknown as AgentAdapter,
    );

    const [discovered] = await discoverInstalledAgentCapabilities(
      [
        {
          ...claudeCli,
          installation: {
            executableName: "claude",
            executablePath: "/usr/local/bin/claude",
          },
        },
      ],
      { createAdapter },
    );

    expect(discoverCapabilities).toHaveBeenCalledWith({
      executablePath: "/usr/local/bin/claude",
    });
    expect(discovered?.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
      { id: "claude-auto", risk: "elevated" },
    ]);
    // Versions are normalized to a bare semver so the settings UI can compare them.
    expect(discovered?.installation?.version).toBe("2.1.220");
  });

  it("does not create adapters for missing installations", async () => {
    const missingAgent = createAgentRegistry().list()[0];
    if (!missingAgent) {
      throw new Error("Agent registry is empty");
    }
    const createAdapter = vi.fn();

    const [discovered] = await discoverInstalledAgentCapabilities(
      [
        {
          ...missingAgent,
          availability: "missing",
          installation: {
            executableName: "claude",
            executablePath: null,
          },
        },
      ],
      { createAdapter },
    );

    expect(createAdapter).not.toHaveBeenCalled();
    expect(discovered?.availability).toBe("missing");
  });

  it("probes once per version and serves the cached answer afterwards", async () => {
    const cache = memoryCache();
    const discoverCapabilities = vi.fn(async () => ({
      capabilities: {
        sessionModes: [{ id: "plan", name: "Plan" }],
      },
    }));
    const createAdapter = vi.fn(
      () => ({ discoverCapabilities }) as unknown as AgentAdapter,
    );
    const agents = [installedAgent()];
    const now = () => Date.parse("2026-09-17T00:00:00.000Z");

    const [first] = await discoverInstalledAgentCapabilities(agents, {
      cache,
      createAdapter,
      now,
    });
    const [second] = await discoverInstalledAgentCapabilities(agents, {
      cache,
      createAdapter,
      now,
    });

    expect(discoverCapabilities).toHaveBeenCalledTimes(1);
    expect(first?.capabilities.sessionModes).toEqual([
      { id: "plan", name: "Plan" },
    ]);
    expect(second?.capabilities.sessionModes).toEqual([
      { id: "plan", name: "Plan" },
    ]);
  });

  it("re-probes once the cached answer outlives its TTL", async () => {
    const cache = memoryCache();
    await cache.set("devin", "3000.10.31", {
      capabilities: { sessionModes: [{ id: "stale", name: "Stale" }] },
      probedAt: new Date(
        Date.parse("2026-09-17T00:00:00.000Z") -
          AGENT_CAPABILITY_CACHE_TTL_MS -
          1,
      ).toISOString(),
    });
    const discoverCapabilities = vi.fn(async () => ({
      capabilities: { sessionModes: [{ id: "fresh", name: "Fresh" }] },
    }));

    const [discovered] = await discoverInstalledAgentCapabilities(
      [installedAgent()],
      {
        cache,
        createAdapter: () =>
          ({ discoverCapabilities }) as unknown as AgentAdapter,
        now: () => Date.parse("2026-09-17T00:00:00.000Z"),
      },
    );

    expect(discoverCapabilities).toHaveBeenCalledTimes(1);
    expect(discovered?.capabilities.sessionModes).toEqual([
      { id: "fresh", name: "Fresh" },
    ]);
  });
});

describe("discoverAgentSessionModes", () => {
  it("asks the adapter and persists the answer for later listings", async () => {
    const cache = memoryCache();
    const discoverSessionModes = vi.fn(async () => [
      { id: "normal", name: "Code" },
      { id: "bypass", name: "Bypass Permissions" },
    ]);

    const sessionModes = await discoverAgentSessionModes([installedAgent()], {
      agentId: "devin",
      cache,
      createAdapter: () =>
        ({ discoverSessionModes }) as unknown as AgentAdapter,
    });

    expect(discoverSessionModes).toHaveBeenCalledWith({
      executablePath: "/usr/local/bin/devin",
    });
    expect(sessionModes).toEqual([
      { id: "normal", name: "Code" },
      { id: "bypass", name: "Bypass Permissions" },
    ]);
    expect(
      (await cache.get("devin", "3000.10.31"))?.capabilities.sessionModes,
    ).toEqual(sessionModes);
  });

  it("serves a fresh cached list without opening another session", async () => {
    const cache = memoryCache();
    await cache.set("devin", "3000.10.31", {
      capabilities: { sessionModes: [{ id: "smart", name: "Smart" }] },
      probedAt: "2026-09-16T00:00:00.000Z",
    });
    const discoverSessionModes = vi.fn();

    const sessionModes = await discoverAgentSessionModes([installedAgent()], {
      agentId: "devin",
      cache,
      createAdapter: () =>
        ({ discoverSessionModes }) as unknown as AgentAdapter,
      now: () => Date.parse("2026-09-17T00:00:00.000Z"),
    });

    expect(discoverSessionModes).not.toHaveBeenCalled();
    expect(sessionModes).toEqual([{ id: "smart", name: "Smart" }]);
  });

  it("keeps cached capabilities the mode probe does not own", async () => {
    const cache = memoryCache();
    await cache.set("devin", "3000.10.31", {
      capabilities: {
        permissionModes: [{ id: "claude-default", risk: "normal" }],
      },
      probedAt: "2026-09-01T00:00:00.000Z",
    });

    await discoverAgentSessionModes([installedAgent()], {
      agentId: "devin",
      cache,
      createAdapter: () =>
        ({
          discoverSessionModes: async () => [{ id: "normal", name: "Code" }],
        }) as unknown as AgentAdapter,
      now: () => Date.parse("2026-09-17T00:00:00.000Z"),
    });

    const cached = await cache.get("devin", "3000.10.31");
    expect(cached?.capabilities.sessionModes).toEqual([
      { id: "normal", name: "Code" },
    ]);
    expect(cached?.capabilities.permissionModes).toEqual([
      { id: "claude-default", risk: "normal" },
    ]);
  });
});
