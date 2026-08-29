import type {
  AgentId,
  AgentPermissionMode,
  AgentPermissionModeOption,
} from "./contracts";

function isClaudeHaikuModel(value: string | null | undefined) {
  return Boolean(value && /(^|[^a-z0-9])haiku([^a-z0-9]|$)/i.test(value));
}

export function isAgentPermissionModeSupportedForModel(
  agentId: AgentId,
  permissionMode: AgentPermissionMode,
  modelId?: string | null,
  modelName?: string | null,
) {
  if (agentId !== "claude-agent" || permissionMode !== "claude-auto") {
    return true;
  }

  return !isClaudeHaikuModel(modelId) && !isClaudeHaikuModel(modelName);
}

const fallbackAgentPermissionModes: Record<
  AgentId,
  AgentPermissionModeOption[]
> = {
  "claude-agent": [
    { id: "claude-default", risk: "normal" },
    { id: "claude-accept-edits", risk: "elevated" },
    { id: "claude-bypass-permissions", risk: "dangerous" },
  ],
  codex: [
    { id: "codex-read-only", risk: "normal" },
    { id: "codex-auto", risk: "elevated" },
    { id: "codex-full-access", risk: "dangerous" },
  ],
  "grok-build": [
    { id: "grok-ask", risk: "normal" },
    { id: "grok-auto", risk: "elevated" },
    { id: "grok-always-approve", risk: "dangerous" },
  ],
  opencode: [
    { id: "opencode-ask", risk: "normal" },
    { id: "opencode-allow", risk: "elevated" },
    { id: "opencode-deny", risk: "normal" },
  ],
  pi: [],
};

export function getFallbackAgentPermissionModes(agentId: AgentId) {
  return fallbackAgentPermissionModes[agentId].map((mode) => ({ ...mode }));
}
