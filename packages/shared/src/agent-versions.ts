import {
  type AgentId,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
} from "./contracts";

/**
 * Minimum external CLI version each adapter is verified against. `null` means
 * the adapter has no confirmed floor yet, so any installed version is accepted.
 */
export const agentMinimumVersions: Record<BuiltInAgentId, string | null> = {
  // Claude Agent SDK 0.3.x drives the Claude Code 2.x CLI protocol.
  "claude-agent": "2.0.0",
  // No confirmed floor for `codex app-server` yet.
  codex: null,
  // Matches the @opencode/client version this repo pins.
  opencode: "2.0.20",
  // Built in, ships with the app.
  pi: null,
};

export interface AgentInstallHint {
  command: string;
  docsUrl: string;
}

export const agentInstallHints: Record<
  BuiltInAgentId,
  AgentInstallHint | null
> = {
  "claude-agent": {
    command: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://docs.claude.com/en/docs/claude-code/setup",
  },
  codex: {
    command: "npm install -g @openai/codex",
    docsUrl: "https://developers.openai.com/codex/cli",
  },
  opencode: {
    command: "curl -fsSL https://opencode.ai/install | bash",
    docsUrl: "https://opencode.ai/docs",
  },
  pi: null,
};

export type AgentVersionStatus = "ok" | "outdated" | "unknown";

/**
 * CLIs print versions in their own shape ("2.1.239 (Claude Code)",
 * "codex-cli 0.149.0", "grok 1.0.8 (95f4d45)"), so take the first dotted
 * number triple and drop the surrounding text.
 */
export function parseAgentVersion(output: string | null | undefined) {
  const match = output?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
}

function toParts(version: string) {
  const [core] = version.split("-");
  return core.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** Compares release cores only; prerelease suffixes are ignored. */
export function compareAgentVersions(left: string, right: string) {
  const leftParts = toParts(left);
  const rightParts = toParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }

  return 0;
}

export function getAgentVersionStatus(
  agentId: AgentId,
  version: string | null | undefined,
): AgentVersionStatus {
  const minimum = isAcpRegistryAgentId(agentId)
    ? null
    : agentMinimumVersions[agentId];
  const parsed = parseAgentVersion(version);

  if (!minimum) {
    return "ok";
  }
  if (!parsed) {
    return "unknown";
  }

  return compareAgentVersions(parsed, minimum) < 0 ? "outdated" : "ok";
}
