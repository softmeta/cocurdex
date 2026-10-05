import {
  type AgentId,
  CODEX_BUILT_IN_PROVIDER_ID,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";

export function shouldPersistProviderDefault(
  agentId: AgentId,
  providerId: string,
) {
  // These adapters own their model catalogs; persist their selection in the
  // adapter runtime preferences instead of the global provider model store.
  if (
    isAcpRegistryAgentId(agentId) ||
    agentId === "claude-agent" ||
    agentId === "opencode"
  ) {
    return false;
  }

  return providerId !== CODEX_BUILT_IN_PROVIDER_ID;
}
