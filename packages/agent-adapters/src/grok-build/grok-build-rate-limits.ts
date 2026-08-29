import type { AgentRateLimitsRecord } from "@cocurdex/shared";
import {
  createRateLimitsRecord,
  createRateLimitWindow,
} from "../shared/rate-limits";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGrokBuildRateLimits(
  value: unknown,
): AgentRateLimitsRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const response = isRecord(value.result) ? value.result : value;
  const config = isRecord(response.config) ? response.config : null;
  const period =
    config && isRecord(config.currentPeriod) ? config.currentPeriod : null;
  const periodType =
    period && typeof period.type === "string" ? period.type.toUpperCase() : "";
  const kind = periodType.includes("WEEKLY") ? "weekly" : "monthly";

  return createRateLimitsRecord([
    createRateLimitWindow({
      kind,
      resetsAt:
        period && typeof period.end === "string"
          ? period.end
          : typeof config?.billingPeriodEnd === "string"
            ? config.billingPeriodEnd
            : null,
      usedPercent: config?.creditUsagePercent,
    }),
  ]);
}
