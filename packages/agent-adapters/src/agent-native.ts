import {
  type AgentId,
  type CompatibleProviderModel,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import { listAcpRegistryProviderModels } from "./acp-registry";
import { listClaudeCliProviderModels } from "./claude-cli";
import {
  generateCodexConversationTitle,
  listCodexProviderModels,
} from "./codex";
import { deleteOpenCodeSession, listOpenCodeProviderModels } from "./opencode";

export interface AgentModelListOptions {
  forceRefresh?: boolean;
}

export function listAgentModels(
  agentId: AgentId,
  options: AgentModelListOptions = {},
): Promise<CompatibleProviderModel[]> | null {
  if (isAcpRegistryAgentId(agentId)) {
    return listAcpRegistryProviderModels(agentId, options);
  }
  switch (agentId) {
    case "claude-agent":
      return listClaudeCliProviderModels(undefined, undefined, options);
    case "codex":
      return listCodexProviderModels(options);
    case "opencode":
      return listOpenCodeProviderModels(options);
    case "pi":
      return null;
  }
}

export interface AgentConversationTitleInput {
  message: string;
  modelId?: string;
  signal?: AbortSignal;
}

export function generateAgentConversationTitle(
  agentId: AgentId,
  input: AgentConversationTitleInput,
): Promise<string | null> | null {
  if (agentId !== "codex") return null;
  return generateCodexConversationTitle({
    message: input.message,
    ...(input.modelId ? { model: input.modelId } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

export async function deleteAgentProviderSession(
  agentId: AgentId,
  providerSessionId: string,
) {
  if (agentId === "opencode") {
    await deleteOpenCodeSession({ providerSessionId });
  }
}
