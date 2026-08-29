import type { ReasoningEffort } from "@cocurdex/shared";

// Codex's own display names for its effort ladder. Mirrors
// `reasoning_effort_label` in codex-rs/tui/src/chatwidget/model_popups.rs; the
// app-server protocol ships ids and descriptions only.
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
