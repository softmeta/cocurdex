import {
  type AgentId,
  type BuiltInAgentId,
  type CompatibleProviderModel,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import { createAcpRegistryPlugin } from "./acp-registry/plugin";
import type {
  AgentConversationTitleInput,
  AgentModelListOptions,
  AgentRuntimePlugin,
} from "./agent-plugin";
import { claudeAgentPlugin } from "./claude-cli/plugin";
import { codexPlugin } from "./codex/plugin";
import { opencodePlugin } from "./opencode/plugin";
import { piPlugin } from "./pi-sdk/plugin";

export type {
  AgentConversationTitleInput,
  AgentModelListOptions,
  AgentRuntimePlugin,
} from "./agent-plugin";

const builtInAgentPlugins: Readonly<
  Record<BuiltInAgentId, AgentRuntimePlugin>
> = {
  "claude-agent": claudeAgentPlugin,
  codex: codexPlugin,
  opencode: opencodePlugin,
  pi: piPlugin,
};

export function findAgentPlugin(agentId: AgentId): AgentRuntimePlugin | null {
  if (isAcpRegistryAgentId(agentId)) return createAcpRegistryPlugin(agentId);
  return Object.hasOwn(builtInAgentPlugins, agentId)
    ? builtInAgentPlugins[agentId]
    : null;
}

export function listAgentModels(
  agentId: AgentId,
  options: AgentModelListOptions = {},
): Promise<CompatibleProviderModel[]> | null {
  return findAgentPlugin(agentId)?.listModels?.(options) ?? null;
}

export function generateAgentConversationTitle(
  agentId: AgentId,
  input: AgentConversationTitleInput,
): Promise<string | null> | null {
  return findAgentPlugin(agentId)?.generateConversationTitle?.(input) ?? null;
}

export async function deleteAgentProviderSession(
  agentId: AgentId,
  providerSessionId: string,
) {
  await findAgentPlugin(agentId)?.deleteProviderSession?.(providerSessionId);
}
