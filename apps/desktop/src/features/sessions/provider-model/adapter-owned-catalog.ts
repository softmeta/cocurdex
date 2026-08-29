import type { AgentId } from "@cocurdex/shared";

/**
 * Agents whose model picker is filled by adapter discovery
 * (`listClaudeCliProviderModels` / `listGrokBuildProviderModels` /
 * `listCodexProviderModels` / `listOpenCodeProviderModels`), not by filtering
 * the app-managed provider table.
 *
 * Pi is the only agent that uses the global provider store as its catalog.
 * Active-session pickers must not reintroduce global rows for the others —
 * that is what made Grok/OpenCode show OpenRouter models mid-session.
 */
export function usesAdapterOwnedModelCatalog(agentId: AgentId) {
  return (
    agentId === "claude-agent" ||
    agentId === "codex" ||
    agentId === "grok-build" ||
    agentId === "opencode"
  );
}
