import {
  type AgentInstallHint,
  builtInAgentManifests,
} from "./built-in-agents";
import { type AgentId, isAcpRegistryAgentId } from "./contracts";

export type { AgentInstallHint } from "./built-in-agents";

export function getAgentMinimumVersion(agentId: AgentId): string | null {
  return isAcpRegistryAgentId(agentId)
    ? null
    : (builtInAgentManifests[agentId]?.minimumVersion ?? null);
}

export function getAgentInstallHint(agentId: AgentId): AgentInstallHint | null {
  return isAcpRegistryAgentId(agentId)
    ? null
    : (builtInAgentManifests[agentId]?.installHint ?? null);
}

export type AgentVersionStatus = "ok" | "outdated" | "unknown";

export function parseAgentVersion(output: string | null | undefined) {
  if (!output) return null;
  let start = 0;
  let end = 0;
  let parts = 0;
  for (const digits of output.matchAll(/\d+/g)) {
    if (parts > 0 && digits.index === end + 1 && output[end] === ".") {
      parts += 1;
    } else {
      start = digits.index;
      parts = 1;
    }
    end = digits.index + digits[0].length;
    if (parts === 3) {
      const prerelease = /^-[0-9A-Za-z.-]+/.exec(output.slice(end));
      return output.slice(start, end + (prerelease?.[0].length ?? 0));
    }
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
  const minimum = getAgentMinimumVersion(agentId);
  const parsed = parseAgentVersion(version);

  if (!minimum) {
    return "ok";
  }
  if (!parsed) {
    return "unknown";
  }

  return compareAgentVersions(parsed, minimum) < 0 ? "outdated" : "ok";
}
