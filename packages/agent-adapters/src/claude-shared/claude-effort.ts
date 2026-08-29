import type {
  AgentThinkingLevel,
  ClaudeReasoningEffort,
} from "@cocurdex/shared";

const claudeReasoningEfforts = new Set<ClaudeReasoningEffort>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export function getClaudeReasoningEffort(
  thinkingLevel: AgentThinkingLevel | null | undefined,
): ClaudeReasoningEffort | undefined {
  return claudeReasoningEfforts.has(thinkingLevel as ClaudeReasoningEffort)
    ? (thinkingLevel as ClaudeReasoningEffort)
    : undefined;
}
