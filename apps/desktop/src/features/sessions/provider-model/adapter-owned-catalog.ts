import type { AgentId } from "@cocurdex/shared";

/**
 * Agents whose model picker is filled by adapter discovery
 * (`listClaudeCliProviderModels` / `listGrokBuildProviderModels` /
 * `listCursorProviderModels` / `listDevinProviderModels` /
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
    agentId === "cursor" ||
    agentId === "devin" ||
    agentId === "grok-build" ||
    agentId === "opencode"
  );
}

// Agents that reveal a model's runtime axes (effort ladder, speed tiers) only
// inside a session running that model. Their catalog ships without axes and
// the picker probes the selected model on demand.
export function usesLazyModelAxesProbe(agentId: AgentId) {
  return agentId === "devin";
}
