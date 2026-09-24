import type {
  AgentId,
  AgentSessionConfigOption,
  AgentThinkingLevel,
  ReasoningEffort,
  ReasoningEffortOption,
} from "@cocurdex/shared";
import {
  isReasoningEffort,
  piThinkingLevels,
  reasoningEfforts,
} from "@cocurdex/shared";
import { findSessionConfigOption } from "./session-config-options";

// Model metadata the thinking-level picker needs, normalized so both the
// new-session card (provider model record) and an active session (provider
// snapshot) can feed it.
/**
 * One row of the thinking-level menu. `label` / `description` are the agent's
 * own copy when it publishes them; pi and agents without copy fall back to the
 * localized level names.
 */
export interface ThinkingLevelOption {
  level: AgentThinkingLevel;
  label?: string | null;
  description?: string | null;
  /** The level the agent runs at when the session picks none. */
  isDefault?: boolean;
}

export interface ThinkingLevelSource {
  agentType: AgentId;
  supportsReasoning?: boolean;
  thinkingLevelMapJson?: string | null;
  supportedReasoningEfforts?: ReasoningEffortOption[];
  /** Null when the agent publishes no default; nothing is preselected then. */
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

// Agents that report their own reasoning-effort menu (Grok Build, Devin,
// Claude Agent — all over ACP) drive the picker straight from that list —
// no pi-style thinkingLevelMap.
function getReportedThinkingLevels(
  source: ThinkingLevelSource,
): ThinkingLevelOption[] {
  const seen = new Set<string>();

  return (
    (source.supportedReasoningEfforts ?? [])
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
      // Agents report their efforts in their own order (Grok Build lists them
      // high first); the menu always reads low to high.
      .sort(
        (a, b) =>
          reasoningEfforts.indexOf(a.level as ReasoningEffort) -
          reasoningEfforts.indexOf(b.level as ReasoningEffort),
      )
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
    source.agentType === "grok-build" ||
    source.agentType === "claude-agent" ||
    source.agentType === "devin"
  ) {
    return getReportedThinkingLevels(source);
  }
  return [];
}

// Sessions persisted before an agent started reporting effort metadata (or
// agents that only expose the axis live, like Devin's `thought_level`
// config option) still get a picker built from the session's own option.
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
      // ACP agents spell "no thinking" as `none`; the picker calls it `off`.
      level: (item.value === "none" ? "off" : item.value) as AgentThinkingLevel,
      label: item.name,
      description: item.description,
      isDefault: item.value === option.currentValue,
    }));
}

/**
 * An unset session shows the agent's own default when it publishes one, and no
 * selection at all when it does not — the picker never invents a level.
 */
export function resolveThinkingLevel(
  options: ThinkingLevelOption[],
  preferred: AgentThinkingLevel,
): AgentThinkingLevel | null {
  if (options.some((option) => option.level === preferred)) {
    return preferred;
  }

  return options.find((option) => option.isDefault)?.level ?? null;
}

// The agent's own name for a level, or null when it publishes none and the
// caller should fall back to the localized level name.
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
