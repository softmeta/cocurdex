import type { AgentRateLimitsRecord } from "@cocurdex/shared";
import {
  createRateLimitsRecord,
  createRateLimitWindow,
  inferRateLimitWindowKind,
} from "../shared/rate-limits";
import { isRecord } from "./codex-app-server-events";

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
