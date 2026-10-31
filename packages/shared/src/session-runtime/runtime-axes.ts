import { supportsInSessionRuntimeAxis } from "../agent-runtime-capabilities";
import type { SessionRuntimeSelection } from "../contracts";
import {
  type AgentId,
  type AgentProviderSnapshot,
  type AgentSessionConfigOption,
  type AgentThinkingLevel,
  type CodexServiceTierOption,
  isReasoningEffort,
  type ProviderModelRecord,
  type ReasoningEffort,
} from "../contracts";
import {
  getDefaultOpenCodeAgent,
  getOpenCodeRuntimeOptions,
  resolveOpenCodeRuntimeValue,
} from "./opencode-runtime-options";
import {
  findSessionConfigOption,
  getConfigOptionSpeedTiers,
} from "./session-config-options";
import {
  getConfigOptionThinkingLevels,
  getThinkingLevelOptions,
  resolveThinkingLevel,
  type ThinkingLevelOption,
} from "./thinking-level";

export interface ReasoningEffortChoice {
  effort: ReasoningEffort;
  label: string | null;
  description: string;
}

export interface SessionRuntimeAxes {
  thinking: {
    options: ThinkingLevelOption[];
    selected: AgentThinkingLevel | null;
  } | null;
  effort: {
    options: ReasoningEffortChoice[];
    selected: ReasoningEffort | null;
  } | null;
  speed: { tiers: CodexServiceTierOption[]; selected: string | null } | null;
  fastMode: boolean | null;
  openCode: {
    agents: string[];
    variants: string[];
    agent: string;
    variant: string;
  } | null;
}

function effortChoices(model: ProviderModelRecord): ReasoningEffortChoice[] {
  return (model.supportedReasoningEfforts ?? []).flatMap((option) =>
    isReasoningEffort(option.reasoningEffort)
      ? [
          {
            effort: option.reasoningEffort,
            label: option.label ?? null,
            description: option.description,
          },
        ]
      : [],
  );
}

function effortAxis(
  model: ProviderModelRecord,
  selection: SessionRuntimeSelection,
): SessionRuntimeAxes["effort"] {
  const options = effortChoices(model);
  if (options.length === 0) return null;
  const has = (effort: unknown) =>
    options.some((option) => option.effort === effort);
  const fallback = has(model.defaultReasoningEffort)
    ? (model.defaultReasoningEffort as ReasoningEffort)
    : null;
  return {
    options,
    selected: has(selection.reasoningEffort)
      ? (selection.reasoningEffort as ReasoningEffort)
      : fallback,
  };
}

function thinkingAxis(
  agentId: AgentId,
  model: ProviderModelRecord,
  selection: SessionRuntimeSelection,
  configOptions: readonly AgentSessionConfigOption[],
): SessionRuntimeAxes["thinking"] {
  const modelOptions = getThinkingLevelOptions({
    agentType: agentId,
    supportsReasoning: model.reasoning,
    thinkingLevelMapJson: model.thinkingLevelMapJson,
    supportedReasoningEfforts: model.supportedReasoningEfforts,
    defaultReasoningEffort: model.defaultReasoningEffort ?? null,
  });
  const options =
    modelOptions.length === 0 &&
    supportsInSessionRuntimeAxis(agentId, "thinking")
      ? getConfigOptionThinkingLevels(configOptions)
      : modelOptions;
  if (options.length < 2) return null;
  return {
    options,
    selected: resolveThinkingLevel(
      options,
      selection.thinkingLevel ?? "default",
    ),
  };
}

function speedAxis(
  agentId: AgentId,
  model: ProviderModelRecord,
  selection: SessionRuntimeSelection,
  configOptions: readonly AgentSessionConfigOption[],
): SessionRuntimeAxes["speed"] {
  if (!supportsInSessionRuntimeAxis(agentId, "speed")) return null;
  const catalogTiers = model.serviceTiers ?? [];
  const tiers =
    catalogTiers.length > 0
      ? catalogTiers
      : getConfigOptionSpeedTiers(
          findSessionConfigOption(configOptions, "speed"),
        );
  if (tiers.length === 0) return null;
  const selected = tiers.some((tier) => tier.id === selection.serviceTier)
    ? (selection.serviceTier ?? null)
    : null;
  return { tiers, selected };
}

function openCodeAxis(
  model: ProviderModelRecord,
  snapshot: AgentProviderSnapshot | null,
  selection: SessionRuntimeSelection,
): SessionRuntimeAxes["openCode"] {
  const options = getOpenCodeRuntimeOptions(model, snapshot);
  if (options.agents.length === 0 && options.variants.length === 0) {
    return null;
  }
  return {
    agents: options.agents,
    variants: options.variants,
    agent:
      resolveOpenCodeRuntimeValue(selection.openCodeAgent, options.agents) ||
      getDefaultOpenCodeAgent(options),
    variant: resolveOpenCodeRuntimeValue(
      selection.openCodeVariant,
      options.variants,
    ),
  };
}

export function getSessionRuntimeAxes(
  agentId: AgentId,
  model: ProviderModelRecord | null | undefined,
  selection: SessionRuntimeSelection,
  snapshot: AgentProviderSnapshot | null = null,
  configOptions: readonly AgentSessionConfigOption[] = [],
): SessionRuntimeAxes {
  if (!model) {
    return {
      thinking: null,
      effort: null,
      speed: null,
      fastMode: null,
      openCode: null,
    };
  }
  return {
    thinking:
      agentId === "codex"
        ? null
        : thinkingAxis(agentId, model, selection, configOptions),
    effort: agentId === "codex" ? effortAxis(model, selection) : null,
    speed: speedAxis(agentId, model, selection, configOptions),
    fastMode:
      agentId === "claude-agent" && model.supportsFastMode
        ? (selection.fastMode ?? false)
        : null,
    openCode:
      agentId === "opencode" ? openCodeAxis(model, snapshot, selection) : null,
  };
}

export function snapshotRuntimeSelection(
  snapshot: AgentProviderSnapshot | null | undefined,
): SessionRuntimeSelection {
  return {
    reasoningEffort: snapshot?.reasoningEffort ?? null,
    serviceTier: snapshot?.serviceTier ?? null,
    fastMode: snapshot?.fastMode ?? null,
    thinkingLevel: snapshot?.thinkingLevel ?? null,
    openCodeAgent: snapshot?.openCodeAgent ?? null,
    openCodeVariant: snapshot?.openCodeVariant ?? null,
  };
}
