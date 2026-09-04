import type {
  AgentPermissionMode,
  CollaborationModeKind,
} from "@cocurdex/shared";
import { isAgentPermissionModeSupportedForModel } from "@cocurdex/shared";
import { getClaudePermissionMode } from "../claude-shared";
import { buildChildProcessEnv } from "../shared";

// Preserve Claude's Anthropic, Bedrock, Vertex, and Foundry auth while keeping
// credentials for unrelated agent runtimes out of the spawned process.
const CLAUDE_BLOCKED_ENV_PREFIXES = [
  "CODEX_",
  "GEMINI_",
  "GOOGLE_",
  "OPENAI_",
  "OPENCODE_",
  "PI_",
] as const;

export function buildClaudeCliEnv(env: NodeJS.ProcessEnv = process.env) {
  return buildChildProcessEnv(env, {
    blockedEnvPrefixes: CLAUDE_BLOCKED_ENV_PREFIXES,
    extraAllowedNames: [
      "GOOGLE_APPLICATION_CREDENTIALS",
      "GOOGLE_CLOUD_PROJECT",
      "XPC_FLAGS",
      "XPC_SERVICE_NAME",
      "__CFBundleIdentifier",
      "__CF_USER_TEXT_ENCODING",
    ],
  });
}

export function getClaudeCliPermissionMode(
  permissionMode: AgentPermissionMode | undefined,
  collaborationMode: CollaborationModeKind,
  modelId?: string | null,
) {
  const runtimeMode = getClaudePermissionMode(
    permissionMode,
    collaborationMode,
  );

  if (
    permissionMode &&
    runtimeMode === "auto" &&
    !isAgentPermissionModeSupportedForModel(
      "claude-agent",
      permissionMode,
      modelId,
    )
  ) {
    return "default";
  }

  return runtimeMode;
}
