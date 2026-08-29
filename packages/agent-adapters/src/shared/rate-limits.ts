import type {
  AgentRateLimitsRecord,
  AgentRateLimitWindow,
  AgentRateLimitWindowKind,
} from "@cocurdex/shared";

export function createRateLimitWindow(options: {
  kind: AgentRateLimitWindowKind;
  resetsAt?: number | string | null;
  usedPercent: unknown;
  windowDurationMinutes?: number | null;
}): AgentRateLimitWindow | null {
  if (
    typeof options.usedPercent !== "number" ||
    !Number.isFinite(options.usedPercent)
  ) {
    return null;
  }

  const resetsAt = toIsoTimestamp(options.resetsAt);
  return {
    kind: options.kind,
    usedPercent: Math.max(0, Math.min(100, options.usedPercent)),
    ...(resetsAt ? { resetsAt } : {}),
    ...(typeof options.windowDurationMinutes === "number"
      ? { windowDurationMinutes: options.windowDurationMinutes }
      : {}),
  };
}

export function createRateLimitsRecord(
  windows: Array<AgentRateLimitWindow | null>,
  updatedAt = new Date().toISOString(),
): AgentRateLimitsRecord | null {
  const availableWindows = windows.filter(
    (window): window is AgentRateLimitWindow => window !== null,
  );
  return availableWindows.length > 0
    ? { windows: availableWindows, updatedAt }
    : null;
}

export function inferRateLimitWindowKind(
  fallback: "primary" | "secondary",
  windowDurationMinutes: number | null,
): AgentRateLimitWindowKind {
  if (windowDurationMinutes === 300) {
    return "five-hour";
  }
  if (
    windowDurationMinutes !== null &&
    windowDurationMinutes >= 6 * 24 * 60 &&
    windowDurationMinutes <= 8 * 24 * 60
  ) {
    return "weekly";
  }
  return fallback;
}

function toIsoTimestamp(value: number | string | null | undefined) {
  if (value == null) {
    return null;
  }
  const date =
    typeof value === "number"
      ? new Date(value < 10_000_000_000 ? value * 1000 : value)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
