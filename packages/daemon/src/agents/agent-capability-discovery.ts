import { createAgentAdapter } from "@cocurdex/agent-adapters";
import type { AgentAdapter } from "@cocurdex/agent-core";
import {
  type AgentDescriptor,
  type AgentId,
  parseAgentVersion,
} from "@cocurdex/shared";

export interface AgentCapabilityDiscoveryOptions {
  createAdapter?(agentId: AgentId): AgentAdapter;
}

export async function discoverInstalledAgentCapabilities(
  agents: AgentDescriptor[],
  options: AgentCapabilityDiscoveryOptions = {},
): Promise<AgentDescriptor[]> {
  const createAdapter = options.createAdapter ?? createAgentAdapter;

  return Promise.all(
    agents.map(async (agent) => {
      const executablePath = agent.installation?.executablePath;
      if (agent.availability !== "available" || !executablePath) {
        return agent;
      }

      const adapter = createAdapter(agent.id);
      if (!adapter.discoverCapabilities) {
        return agent;
      }

      try {
        const discovery = await adapter.discoverCapabilities({
          executablePath,
        });
        return {
          ...agent,
          capabilities: {
            ...agent.capabilities,
            ...discovery.capabilities,
          },
          installation: {
            executableName: agent.installation?.executableName ?? null,
            executablePath,
            version:
              parseAgentVersion(discovery.version) ??
              agent.installation?.version ??
              null,
          },
        };
      } catch {
        return agent;
      }
    }),
  );
}
