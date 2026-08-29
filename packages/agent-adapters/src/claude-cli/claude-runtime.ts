import type { SDKSystemMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentMcpServerRuntime,
  AgentProviderRuntimeSnapshot,
  AgentProviderSessionRecord,
} from "@cocurdex/shared";

const CLAUDE_RUNTIME_FINGERPRINT_VERSION = 1;

export function createClaudeRuntimeFingerprint(input: {
  executablePath: string;
  configDir?: string | null;
  workspaceRootPath: string;
}) {
  return JSON.stringify({
    configDir: input.configDir ?? null,
    executablePath: input.executablePath,
    provider: "claude-agent-sdk",
    version: CLAUDE_RUNTIME_FINGERPRINT_VERSION,
    workspaceRootPath: input.workspaceRootPath,
  });
}

export function readClaudeRuntimeFingerprint(
  providerState: Pick<AgentProviderSessionRecord, "providerStateJson"> | null,
) {
  if (!providerState?.providerStateJson) {
    return undefined;
  }

  try {
    const value = JSON.parse(providerState.providerStateJson) as {
      runtimeFingerprint?: unknown;
    };
    return typeof value.runtimeFingerprint === "string"
      ? value.runtimeFingerprint
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Compare two MCP catalogs by membership and status.
 *
 * The SDK reports server order from its own config walk, which is stable within
 * a session, so position is treated as part of the identity here — a reorder
 * only costs one redundant runtime event.
 */
export function hasSameMcpServerStatuses(
  current: readonly AgentMcpServerRuntime[],
  next: readonly AgentMcpServerRuntime[],
) {
  return (
    current.length === next.length &&
    current.every(
      (server, index) =>
        server.name === next[index].name &&
        server.status === next[index].status,
    )
  );
}

export function createClaudeProviderRuntimeSnapshot(
  message: SDKSystemMessage,
): AgentProviderRuntimeSnapshot {
  return {
    apiKeySource: message.apiKeySource,
    capabilities: [...(message.capabilities ?? [])],
    cwd: message.cwd,
    fastModeDisabledReason: message.fast_mode_disabled_reason ?? null,
    fastModeState: message.fast_mode_state ?? null,
    mcpServers: message.mcp_servers.map(({ name, status }) => ({
      name,
      status,
    })),
    model: message.model,
    providerId: "claude-agent",
    runtimeVersion: message.claude_code_version,
    skills: [...message.skills],
    tools: [...message.tools],
  };
}
