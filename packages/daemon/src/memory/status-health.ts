import { withMemoryIdentityHint } from "@cocurdex/shared";
import type { RsrsCloudSummary } from "./rsrs";

export function memoryStatusError(summary: RsrsCloudSummary) {
  if (summary.workspaceMode === "off")
    return "Memory is paused in rsrs. Restore it in rsrs before using memory in Cocurdex.";
  if (!summary.hasKeys)
    return withMemoryIdentityHint("Local memory has not been initialized.");
  if (summary.workspaceMode === "readonly")
    return "Memory is read-only in rsrs. Recall is available, but new memories cannot be saved.";
  return null;
}
