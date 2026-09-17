import { createAgentAdapter } from "@cocurdex/agent-adapters";
import type { AgentAdapter } from "@cocurdex/agent-core";
import type { AgentCapabilityCacheRepository } from "@cocurdex/db";
import {
  type AgentCapabilities,
  type AgentDescriptor,
  type AgentId,
  type AgentSessionMode,
  parseAgentVersion,
} from "@cocurdex/shared";

export const AGENT_CAPABILITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AgentCapabilityDiscoveryOptions {
  cache?: AgentCapabilityCacheRepository;
  createAdapter?(agentId: AgentId): AgentAdapter;
  now?(): number;
}

export interface AgentSessionModeDiscoveryOptions
  extends AgentCapabilityDiscoveryOptions {
  agentId: AgentId;
}

function isFresh(probedAt: string, now: number) {
  const probedTime = Date.parse(probedAt);
  return (
    Number.isFinite(probedTime) &&
    now - probedTime < AGENT_CAPABILITY_CACHE_TTL_MS
  );
}

function mergeCapabilities(
  agent: AgentDescriptor,
  capabilities: Partial<AgentCapabilities>,
  version: string | null | undefined,
): AgentDescriptor {
  return {
    ...agent,
    capabilities: { ...agent.capabilities, ...capabilities },
    installation: {
      executableName: agent.installation?.executableName ?? null,
      executablePath: agent.installation?.executablePath ?? null,
      version: version ?? agent.installation?.version ?? null,
    },
  };
}

export async function discoverInstalledAgentCapabilities(
  agents: AgentDescriptor[],
  options: AgentCapabilityDiscoveryOptions = {},
): Promise<AgentDescriptor[]> {
  const createAdapter = options.createAdapter ?? createAgentAdapter;
  const cache = options.cache;
  const now = options.now ?? Date.now;

  return Promise.all(
    agents.map(async (agent) => {
      const executablePath = agent.installation?.executablePath;
      if (agent.availability !== "available" || !executablePath) {
        return agent;
      }

      const version = agent.installation?.version ?? null;
      if (cache && version) {
        const cached = await cache.get(agent.id, version);
        if (cached && isFresh(cached.probedAt, now())) {
          return mergeCapabilities(agent, cached.capabilities, version);
        }
      }

      const adapter = createAdapter(agent.id);
      if (!adapter.discoverCapabilities) {
        return agent;
      }

      try {
        const discovery = await adapter.discoverCapabilities({
          executablePath,
        });
        if (cache && version) {
          await cache.set(agent.id, version, {
            capabilities: discovery.capabilities,
            probedAt: new Date(now()).toISOString(),
          });
        }
        return mergeCapabilities(
          agent,
          discovery.capabilities,
          parseAgentVersion(discovery.version),
        );
      } catch {
        return agent;
      }
    }),
  );
}

export async function discoverAgentSessionModes(
  agents: AgentDescriptor[],
  options: AgentSessionModeDiscoveryOptions,
): Promise<AgentSessionMode[]> {
  const { agentId } = options;
  const agent = agents.find((candidate) => candidate.id === agentId);
  const executablePath = agent?.installation?.executablePath;
  const version = agent?.installation?.version;
  if (agent?.availability !== "available" || !executablePath) {
    return agent?.capabilities.sessionModes ?? [];
  }

  const cache = options.cache;
  const now = options.now ?? Date.now;
  if (cache && version) {
    const cached = await cache.get(agentId, version);
    if (cached?.capabilities.sessionModes && isFresh(cached.probedAt, now())) {
      return cached.capabilities.sessionModes;
    }
  }

  const createAdapter = options.createAdapter ?? createAgentAdapter;
  const adapter = createAdapter(agentId);
  if (!adapter.discoverSessionModes) {
    return agent.capabilities.sessionModes;
  }

  const sessionModes = await adapter.discoverSessionModes({ executablePath });
  if (cache && version) {
    const existing = await cache.get(agentId, version);
    await cache.set(agentId, version, {
      capabilities: { ...existing?.capabilities, sessionModes },
      probedAt: new Date(now()).toISOString(),
    });
  }
  return sessionModes;
}
