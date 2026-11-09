import {
  type AgentDescriptor,
  type AgentInstallHint,
  agentInstallHints,
  agentMinimumVersions,
  getAgentVersionStatus,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";

export type AdapterStatusKind =
  | "builtin"
  | "detecting"
  | "ready"
  | "outdated"
  | "missing"
  | "error"
  | "disabled";

export interface AdapterStatus {
  kind: AdapterStatusKind;
  version: string | null;
  minimumVersion: string | null;
  executablePath: string | null;
  installHint: AgentInstallHint | null;
  error: string | null;
}

export function getAdapterStatus(agent: AgentDescriptor): AdapterStatus {
  const isRegistryAgent = isAcpRegistryAgentId(agent.id);
  const version = agent.installation?.version ?? null;
  const base = {
    version,
    minimumVersion: isAcpRegistryAgentId(agent.id)
      ? null
      : agentMinimumVersions[agent.id],
    executablePath: agent.installation?.executablePath ?? null,
    installHint: isAcpRegistryAgentId(agent.id)
      ? null
      : agentInstallHints[agent.id],
    error: agent.installation?.error ?? null,
  };

  if (!base.installHint && !isRegistryAgent) {
    return { ...base, kind: "builtin" };
  }
  if (agent.enabled === false) {
    return { ...base, kind: "disabled" };
  }
  if (!agent.installation) {
    return { ...base, kind: "detecting" };
  }
  if (agent.availability === "error") {
    return { ...base, kind: "error" };
  }
  if (agent.availability !== "available") {
    return { ...base, kind: "missing" };
  }
  if (getAgentVersionStatus(agent.id, version) === "outdated") {
    return { ...base, kind: "outdated" };
  }

  return { ...base, kind: "ready" };
}

export function isAdapterSelectable(kind: AdapterStatusKind) {
  return kind === "builtin" || kind === "ready" || kind === "outdated";
}

export function isAgentReadyToStart(agent: AgentDescriptor) {
  return isAdapterSelectable(getAdapterStatus(agent).kind);
}
