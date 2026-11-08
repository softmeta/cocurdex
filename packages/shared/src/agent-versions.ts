import {
  type AgentId,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
} from "./contracts";

export const agentMinimumVersions: Record<BuiltInAgentId, string | null> = {
  "claude-agent": "2.0.0",
  codex: null,
  opencode: "2.0.20",
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

export function parseAgentVersion(output: string | null | undefined) {
  if (!output) return null;
  const version = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/y;
  for (const digits of output.matchAll(/\d+/g)) {
    version.lastIndex = digits.index;
    const match = version.exec(output);
    if (match) return match[0];
  }
  return null;
}

function toParts(version: string) {
  const [core] = version.split("-");
  return core.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

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
