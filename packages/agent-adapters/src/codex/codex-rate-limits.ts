import type { AgentRateLimitsRecord } from "@cocurdex/shared";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  createRateLimitsRecord,
  createRateLimitWindow,
  inferRateLimitWindowKind,
} from "../shared/rate-limits";
import { isRecord } from "./codex-app-server-events";
import {
  acquireCodexClient,
  type CodexClientLease,
} from "./codex-app-server-pool";

export function parseCodexRateLimits(
  value: unknown,
): AgentRateLimitsRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const rateLimits = isRecord(value.rateLimits) ? value.rateLimits : value;
  return createRateLimitsRecord([
    parseWindow(rateLimits.primary, "primary"),
    parseWindow(rateLimits.secondary, "secondary"),
  ]);
}

export async function readCodexRateLimits(
  acquireClient: () => CodexClientLease = acquireCodexClient,
): Promise<AgentRateLimitsRecord | null> {
  const lease = acquireClient();

  try {
    return parseCodexRateLimits(
      await lease.client.request("account/rateLimits/read"),
    );
  } catch (error) {
    logAdapterDiagnostic("debug", "[CodexAdapter] rate limits unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    lease.release();
  }
}

function parseWindow(value: unknown, fallbackKind: "primary" | "secondary") {
  if (!isRecord(value)) {
    return null;
  }
  const duration =
    typeof value.windowDurationMins === "number"
      ? value.windowDurationMins
      : null;
  return createRateLimitWindow({
    kind: inferRateLimitWindowKind(fallbackKind, duration),
    resetsAt:
      typeof value.resetsAt === "number" || typeof value.resetsAt === "string"
        ? value.resetsAt
        : null,
    usedPercent: value.usedPercent,
    windowDurationMinutes: duration,
  });
}
