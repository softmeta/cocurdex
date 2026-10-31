import {
  type AgentToolCallResult,
  type ExecutionToolCallSummary,
  formatDurationMs,
  formatToolCallOutput,
  unwrapShellCommand,
} from "@cocurdex/shared";
import { getToolCallSummary } from "../tool-call/tool-call-utils";

export const OUTPUT_TAIL_LINES = 20;

export function getExecutionToolCallLabel(toolCall: ExecutionToolCallSummary) {
  if (toolCall.kind === "exec") return unwrapShellCommand(toolCall.title);
  return getToolCallSummary({
    ...toolCall,
    sessionId: "",
    content: undefined,
    locations: [],
  });
}

export function getExecutionToolCallDurationMs(
  toolCall: ExecutionToolCallSummary,
) {
  if (toolCall.status !== "completed" && toolCall.status !== "failed") {
    return null;
  }
  const duration =
    Date.parse(toolCall.updatedAt) - Date.parse(toolCall.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function formatExecutionDuration(durationMs: number) {
  if (durationMs >= 1000) return formatDurationMs(durationMs);
  return `${Math.max(0.1, durationMs / 1000).toFixed(1)}s`;
}

export function getRunDurationMs(run: {
  startedAt: string;
  endedAt?: string | null;
}) {
  if (!run.endedAt) return null;
  const duration = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function getOutputTail(
  result: AgentToolCallResult | null,
  maxLines = OUTPUT_TAIL_LINES,
) {
  if (!result) return null;
  const output = formatToolCallOutput(result.content, result.rawOutput)
    ?.replace(/\r\n/g, "\n")
    .trimEnd();
  if (!output) return null;
  const lines = output.split("\n");
  return {
    text: lines.slice(-maxLines).join("\n"),
    omittedLines: Math.max(0, lines.length - maxLines),
  };
}
