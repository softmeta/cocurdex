import { type AcpRegistryAgentId, supportsPlanUsage } from "@cocurdex/shared";
import type { AgentRuntimePlugin } from "../agent-plugin";
import {
  createAcpRegistryAdapter,
  listAcpRegistryProviderModels,
  readAcpRegistryRateLimits,
} from "./acp-registry-adapter";

export function createAcpRegistryPlugin(
  agentId: AcpRegistryAgentId,
): AgentRuntimePlugin {
  return {
    createAdapter: () => createAcpRegistryAdapter(agentId),
    slashCommands: "skills",
    listModels: (options) => listAcpRegistryProviderModels(agentId, options),
    ...(supportsPlanUsage(agentId)
      ? { readPlanUsage: () => readAcpRegistryRateLimits(agentId) }
      : {}),
  };
}
