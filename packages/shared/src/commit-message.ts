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
  agentId: AgentId;
  providerConfig: AgentRuntimeProviderConfig;
}
