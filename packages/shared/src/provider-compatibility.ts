import {
  type AgentId,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
  type ProviderApi,
  providerApis,
} from "./contracts";
import type { CompatibleProviderModel } from "./provider-contracts";

const agentApiCompatibility: Record<BuiltInAgentId, ProviderApi[]> = {
  "claude-agent": [],
  codex: ["openai-responses"],
  opencode: ["openai-completions", "openai-responses", "anthropic-messages"],
  pi: [...providerApis],
};

export function getCompatibleProviderApis(agentId: AgentId): ProviderApi[] {
  if (isAcpRegistryAgentId(agentId)) {
    return [];
  }
  return agentApiCompatibility[agentId] ?? [];
}

export function isApiCompatibleWithAgent(agentId: AgentId, api: ProviderApi) {
  return getCompatibleProviderApis(agentId).includes(api);
}

export function isAgentCapableModel(
  capabilities: CompatibleProviderModel["model"]["capabilities"],
) {
  return (
    !capabilities || capabilities.length === 0 || capabilities.includes("agent")
  );
}

export function isChatSupportedApi(api: ProviderApi) {
  return providerApis.includes(api);
}

export function isChatCapableModel(
  capabilities: CompatibleProviderModel["model"]["capabilities"],
) {
  return (
    !capabilities || capabilities.length === 0 || capabilities.includes("chat")
  );
}

export function filterCompatibleProviderModels(
  agentId: AgentId,
  items: CompatibleProviderModel[],
) {
  return items.filter(
    ({ model, provider }) =>
      provider.enabled &&
      model.enabled &&
      isApiCompatibleWithAgent(agentId, model.api) &&
      isAgentCapableModel(model.capabilities),
  );
}
