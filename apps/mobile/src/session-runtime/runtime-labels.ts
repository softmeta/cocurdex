import type {
  AgentThinkingLevel,
  ReasoningEffortChoice,
  SessionRuntimeAxes,
  ThinkingLevelOption,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export interface RuntimeLabels {
  thinking: string;
  speed: string;
  standard: string;
  fastMode: string;
  on: string;
  off: string;
  openCodeAgent: string;
  openCodeVariant: string;
  defaultValue: string;
  level(level: AgentThinkingLevel): string;
}

export function useRuntimeLabels(): RuntimeLabels {
  const { t } = useTranslation("sessions");
  const levels: Record<AgentThinkingLevel, string> = {
    default: t("runtime.levels.default"),
    off: t("runtime.levels.off"),
    minimal: t("runtime.levels.minimal"),
    low: t("runtime.levels.low"),
    medium: t("runtime.levels.medium"),
    high: t("runtime.levels.high"),
    xhigh: t("runtime.levels.xhigh"),
    max: t("runtime.levels.max"),
    ultra: t("runtime.levels.ultra"),
  };
  return {
    thinking: t("runtime.thinking"),
    speed: t("runtime.speed"),
    standard: t("runtime.standard"),
    fastMode: t("runtime.fastMode"),
    on: t("runtime.on"),
    off: t("runtime.off"),
    openCodeAgent: t("runtime.openCodeAgent"),
    openCodeVariant: t("runtime.openCodeVariant"),
    defaultValue: t("runtime.default"),
    level: (level) => levels[level] ?? level,
  };
}

export function thinkingOptionLabel(
  option: ThinkingLevelOption,
  labels: RuntimeLabels,
) {
  return option.label || labels.level(option.level);
}

export function effortChoiceLabel(
  choice: ReasoningEffortChoice,
  labels: RuntimeLabels,
) {
  return choice.label || labels.level(choice.effort);
}

export function runtimeSummary(
  axes: SessionRuntimeAxes,
  labels: RuntimeLabels,
): string[] {
  const parts: string[] = [];
  const thinking = axes.thinking?.options.find(
    (option) => option.level === axes.thinking?.selected,
  );
  if (thinking) parts.push(thinkingOptionLabel(thinking, labels));
  const effort = axes.effort?.options.find(
    (option) => option.effort === axes.effort?.selected,
  );
  if (effort) parts.push(effortChoiceLabel(effort, labels));
  const tier = axes.speed?.tiers.find(
    (option) => option.id === axes.speed?.selected,
  );
  if (tier) parts.push(tier.name);
  if (axes.fastMode) parts.push(labels.fastMode);
  if (axes.openCode?.agent) parts.push(axes.openCode.agent);
  if (axes.openCode?.variant) parts.push(axes.openCode.variant);
  return parts;
}
