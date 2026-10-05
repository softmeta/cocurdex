import { getAcpAgentProfile } from "./acp-agent-profiles";
import {
  type AgentId,
  type AgentPermissionMode,
  type AgentPermissionModeOption,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
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
  BuiltInAgentId,
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
  opencode: [
    { id: "opencode-ask", risk: "normal" },
    { id: "opencode-allow", risk: "elevated" },
    { id: "opencode-deny", risk: "normal" },
  ],
  pi: [],
};

export function getFallbackAgentPermissionModes(agentId: AgentId) {
  if (isAcpRegistryAgentId(agentId)) {
    return (getAcpAgentProfile(agentId).permissionModes ?? []).map((mode) => ({
      ...mode,
    }));
  }
  return fallbackAgentPermissionModes[agentId].map((mode) => ({ ...mode }));
}
