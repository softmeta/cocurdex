import type {
  AgentId,
  AgentSessionConfigOption,
  AgentThinkingLevel,
  ReasoningEffort,
  ReasoningEffortOption,
} from "../contracts";
import {
  isAcpRegistryAgentId,
  isReasoningEffort,
  piThinkingLevels,
  reasoningEfforts,
} from "../contracts";
import { findSessionConfigOption } from "./session-config-options";

export interface ThinkingLevelOption {
  level: AgentThinkingLevel;
  label?: string | null;
  description?: string | null;
  isDefault?: boolean;
}

export interface ThinkingLevelSource {
  agentType: AgentId;
  supportsReasoning?: boolean;
  thinkingLevelMapJson?: string | null;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  defaultReasoningEffort?: Exclude<AgentThinkingLevel, "default"> | null;
}

function getPiThinkingLevels(
  source: ThinkingLevelSource,
): ThinkingLevelOption[] {
  if (!source.supportsReasoning) {
    return [{ level: "off" }];
  }

  let rawMap: Record<string, unknown> | null = null;
  if (source.thinkingLevelMapJson) {
    try {
      rawMap = JSON.parse(source.thinkingLevelMapJson) as Record<
        string,
        unknown
      >;
    } catch {
      rawMap = null;
    }
  }

  return piThinkingLevels
    .filter((level) => {
      const mapped = rawMap?.[level];
      if (mapped === null) return false;
      if (level === "xhigh") return mapped !== undefined;
      return true;
    })
    .map((level) => ({ level }));
}

function getReportedThinkingLevels(
  source: ThinkingLevelSource,
): ThinkingLevelOption[] {
  const seen = new Set<string>();

  return (source.supportedReasoningEfforts ?? [])
    .flatMap((option) => {
      if (seen.has(option.reasoningEffort)) {
        return [];
      }

      seen.add(option.reasoningEffort);
      return [
        {
          level: option.reasoningEffort as AgentThinkingLevel,
          label: option.label,
          description: option.description,
          isDefault: option.reasoningEffort === source.defaultReasoningEffort,
        },
      ];
    })
    .sort(
      (a, b) =>
        reasoningEfforts.indexOf(a.level as ReasoningEffort) -
        reasoningEfforts.indexOf(b.level as ReasoningEffort),
    );
}

export function getThinkingLevelOptions(
  source: ThinkingLevelSource | null | undefined,
): ThinkingLevelOption[] {
  if (!source) {
    return [];
  }
  if (source.agentType === "pi") {
    return getPiThinkingLevels(source);
  }
  if (
    isAcpRegistryAgentId(source.agentType) ||
    source.agentType === "claude-agent"
  ) {
    return getReportedThinkingLevels(source);
  }
  return [];
}

export function getConfigOptionThinkingLevels(
  configOptions: readonly AgentSessionConfigOption[] | null | undefined,
): ThinkingLevelOption[] {
  const option = findSessionConfigOption(configOptions ?? [], "thinking");
  if (option?.type !== "select") {
    return [];
  }
  return (option.options ?? [])
    .filter((item) => isReasoningEffort(item.value) || item.value === "none")
    .map((item) => ({
      level: (item.value === "none" ? "off" : item.value) as AgentThinkingLevel,
      label: item.name,
      description: item.description,
      isDefault: item.value === option.currentValue,
    }));
}

export function resolveThinkingLevel(
  options: ThinkingLevelOption[],
  preferred: AgentThinkingLevel,
): AgentThinkingLevel | null {
  if (options.some((option) => option.level === preferred)) {
    return preferred;
  }

  return options.find((option) => option.isDefault)?.level ?? null;
}

export function getThinkingLevelLabel(
  options: ThinkingLevelOption[],
  level: AgentThinkingLevel,
): string | null {
  return options.find((option) => option.level === level)?.label ?? null;
}

export function getEffectiveThinkingLevel(
  agentType: AgentId,
  reasoningEffort: ReasoningEffort | null | undefined,
  thinkingLevel: AgentThinkingLevel | null | undefined,
): AgentThinkingLevel | null {
  if (agentType === "codex") {
    return reasoningEffort ?? null;
  }

  if (thinkingLevel && thinkingLevel !== "default") {
    return thinkingLevel;
  }

  return reasoningEffort ?? null;
}
