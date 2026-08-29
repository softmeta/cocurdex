import {
  type AgentId,
  type CompatibleProviderModel,
  type ProviderApi,
  providerApis,
} from "./contracts";

const agentApiCompatibility: Record<AgentId, ProviderApi[]> = {
  // Claude Agent runs the user's own `claude` binary with its own auth; it never
  // consumes an app-managed provider, so no api is compatible by design.
  "claude-agent": [],
  codex: ["openai-responses"],
  "grok-build": [],
  opencode: ["openai-completions", "openai-responses", "anthropic-messages"],
  // Pi is Cocurdex's built-in agent — it drives every api Cocurdex supports.
  pi: [...providerApis],
};

// Sessions persist their agentType, so a stored id can outlive the agent it
// names (renamed, removed, or written by a newer build). Treat those as "no
// compatible api" rather than letting the lookup miss reach callers.
export function getCompatibleProviderApis(agentId: AgentId): ProviderApi[] {
  return agentApiCompatibility[agentId] ?? [];
}

export function isApiCompatibleWithAgent(agentId: AgentId, api: ProviderApi) {
  return getCompatibleProviderApis(agentId).includes(api);
}

// Agent pickers only surface models that can drive an agent loop. A model with
// no explicit capabilities is treated as agent-capable for backward
// compatibility; once capabilities are declared, "agent" must be present.
export function isAgentCapableModel(
  capabilities: CompatibleProviderModel["model"]["capabilities"],
) {
  return (
    !capabilities || capabilities.length === 0 || capabilities.includes("agent")
  );
}

const chatSupportedApis: ProviderApi[] = [...providerApis];

export function isChatSupportedApi(api: ProviderApi) {
  return chatSupportedApis.includes(api);
}

// Chat pickers only surface models that can serve a chat turn. Same backward
// compatibility rule as agent capability: no explicit capabilities means the
// model is assumed chat-capable.
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
