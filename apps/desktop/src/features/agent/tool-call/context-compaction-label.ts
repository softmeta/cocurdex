import {
  type AgentToolCallRecord,
  readContextCompactionDetails,
} from "@cocurdex/shared";
import { formatTokenCount } from "@/features/composer";
import { i18n } from "@/i18n";

export function isContextCompactionRunning(toolCall: AgentToolCallRecord) {
  return toolCall.status === "pending" || toolCall.status === "in_progress";
}

export function getContextCompactionLabel(toolCall: AgentToolCallRecord) {
  if (isContextCompactionRunning(toolCall)) {
    return i18n.t("agent:contextCompaction.running");
  }
  if (toolCall.status === "failed") {
    return i18n.t("agent:contextCompaction.failed");
  }
  const { tokensAfter, tokensBefore } = readContextCompactionDetails(toolCall);
  if (tokensBefore !== null && tokensAfter !== null) {
    return i18n.t("agent:contextCompaction.completedRange", {
      before: formatTokenCount(tokensBefore),
      after: formatTokenCount(tokensAfter),
    });
  }
  if (tokensBefore !== null) {
    return i18n.t("agent:contextCompaction.completedFrom", {
      before: formatTokenCount(tokensBefore),
    });
  }
  return i18n.t("agent:contextCompaction.completed");
}
