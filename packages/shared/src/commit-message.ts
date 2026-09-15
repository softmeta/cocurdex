import type {
  AgentId,
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
} from "./contracts";
export interface ResolvedCommitMessageModel {
  agentId: AgentId;
  providerSnapshot: AgentProviderSnapshot;
}
export interface GenerateGitCommitMessagePayload {
  workspaceRootPath: string;
  includeUnstaged: boolean;
  // When omitted, the daemon resolves the configured commit-message model and
  // its runtime provider config from stored settings.
  agentId?: AgentId;
  providerConfig?: AgentRuntimeProviderConfig;
}
