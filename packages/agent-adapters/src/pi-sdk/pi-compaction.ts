import {
  type ContextCompactionTrigger,
  normalizeCompactionTokenCount,
} from "@cocurdex/shared";
import type { ContextCompactionTracker } from "../shared/context-compaction-tracker";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getTrigger(reason: unknown): ContextCompactionTrigger | null {
  if (reason === "manual") {
    return "manual";
  }
  return reason === "threshold" || reason === "overflow" ? "auto" : null;
}

export function handlePiCompactionEvent(
  compaction: ContextCompactionTracker,
  event: Record<string, unknown>,
) {
  const trigger = getTrigger(event.reason);
  if (event.type === "compaction_start") {
    compaction.start({ trigger });
    return;
  }
  if (event.type !== "compaction_end") {
    return;
  }
  const result = getRecord(event.result);
  if (result && event.aborted !== true) {
    compaction.finish({
      status: "completed",
      trigger,
      tokensBefore: normalizeCompactionTokenCount(result.tokensBefore),
      tokensAfter: normalizeCompactionTokenCount(result.estimatedTokensAfter),
    });
    return;
  }
  compaction.finish({
    status: "failed",
    trigger,
    error: typeof event.errorMessage === "string" ? event.errorMessage : null,
  });
}
