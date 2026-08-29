import type { ClaudeReasoningEffort } from "@cocurdex/shared";

export interface T3ClaudeModelCatalogEntry {
  modelId: string;
  name: string;
  supportedReasoningEfforts: ReadonlyArray<ClaudeReasoningEffort>;
  supportsFastMode?: boolean;
}

// T3 Code keeps this catalog as a compatibility supplement to Claude Code's
// account-aware model picker. The dynamic picker remains authoritative when
// it reports the same model id.
export const T3_CLAUDE_MODEL_CATALOG: ReadonlyArray<T3ClaudeModelCatalogEntry> =
  [
    {
      modelId: "claude-fable-5",
      name: "Fable 5",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      modelId: "claude-opus-5",
      name: "Opus 5",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
      supportsFastMode: true,
    },
    {
      modelId: "claude-opus-4-8",
      name: "Opus 4.8",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
      supportsFastMode: true,
    },
    {
      modelId: "claude-opus-4-7",
      name: "Opus 4.7",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
      supportsFastMode: true,
    },
    {
      modelId: "claude-opus-4-6",
      name: "Opus 4.6",
      supportedReasoningEfforts: ["low", "medium", "high", "max"],
      supportsFastMode: true,
    },
    {
      modelId: "claude-opus-4-5",
      name: "Opus 4.5",
      supportedReasoningEfforts: ["low", "medium", "high", "max"],
      supportsFastMode: true,
    },
    {
      modelId: "claude-sonnet-5",
      name: "Sonnet 5",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      modelId: "claude-sonnet-4-6",
      name: "Sonnet 4.6",
      supportedReasoningEfforts: ["low", "medium", "high", "max"],
    },
    {
      modelId: "claude-haiku-4-5",
      name: "Haiku 4.5",
      supportedReasoningEfforts: [],
    },
  ];
