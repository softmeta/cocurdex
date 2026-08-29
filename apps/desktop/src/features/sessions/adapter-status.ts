import type { AgentDescriptor } from "@cocurdex/shared";
import {
  agentInstallHints,
  agentMinimumVersions,
  getAgentVersionStatus,
} from "@cocurdex/shared";

export type AdapterStatusKind =
  | "builtin"
  | "detecting"
  | "ready"
  | "outdated"
  | "missing"
  | "error";

export interface AdapterStatus {
  kind: AdapterStatusKind;
  version: string | null;
  minimumVersion: string | null;
  executablePath: string | null;
  installHint: (typeof agentInstallHints)[keyof typeof agentInstallHints];
  error: string | null;
}

/**
 * 把可用性、已装版本和适配器校验下限收成设置页 / 选择器共用的一种状态。
 */
export function getAdapterStatus(agent: AgentDescriptor): AdapterStatus {
  const minimumVersion = agentMinimumVersions[agent.id];
  const version = agent.installation?.version ?? null;
  const base = {
    version,
    minimumVersion,
    executablePath: agent.installation?.executablePath ?? null,
    installHint: agentInstallHints[agent.id],
    error: agent.installation?.error ?? null,
  };

  // installHint 为 null 表示随应用内置（目前只有 pi）。
  // 其余适配器都是用户安装的 CLI：没有 installation 记录代表检测还没返回，
  // 绝不是内置。
  if (!base.installHint) {
    return { ...base, kind: "builtin" };
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

/** 过期 CLI 仍可选；未安装 / 检测中 / 出错不能开新会话。 */
export function isAdapterSelectable(kind: AdapterStatusKind) {
  return kind === "builtin" || kind === "ready" || kind === "outdated";
}

export function isAgentReadyToStart(agent: AgentDescriptor) {
  return isAdapterSelectable(getAdapterStatus(agent).kind);
}
