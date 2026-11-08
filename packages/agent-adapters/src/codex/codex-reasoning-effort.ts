import type { ReasoningEffort } from "@cocurdex/shared";

const CODEX_REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
  ultra: "Ultra",
};

export function getCodexReasoningEffortLabel(effort: ReasoningEffort) {
  return CODEX_REASONING_EFFORT_LABELS[effort];
}
