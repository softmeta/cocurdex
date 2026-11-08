import type {
  AgentRateLimitsRecord,
  AgentRateLimitWindow,
} from "@cocurdex/shared";

export const CLAUDE_USAGE_METHOD =
  "usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET";

interface ClaudeUsageWindow {
  utilization?: number | null;
  resets_at?: string | null;
}

export interface ClaudePlanUsageResponse {
  subscription_type?: string | null;
  rate_limits_available?: boolean;
  rate_limits?: {
    five_hour?: ClaudeUsageWindow | null;
    seven_day?: ClaudeUsageWindow | null;
    seven_day_opus?: ClaudeUsageWindow | null;
    seven_day_sonnet?: ClaudeUsageWindow | null;
    model_scoped?: ({ display_name?: string } & ClaudeUsageWindow)[];
    extra_usage?: {
      is_enabled?: boolean;
      monthly_limit?: number | null;
      used_credits?: number | null;
      currency?: string | null;
    } | null;
  } | null;
}

function toWindow(
  kind: AgentRateLimitWindow["kind"],
  window: ClaudeUsageWindow | null | undefined,
  label?: string,
): AgentRateLimitWindow | null {
  const utilization = window?.utilization;
  if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
    return null;
  }

  return {
    kind,
    usedPercent: Math.max(0, Math.min(100, utilization)),
    ...(window?.resets_at ? { resetsAt: window.resets_at } : {}),
    ...(label ? { label } : {}),
  };
}

function readCredits(
  extraUsage: NonNullable<
    NonNullable<ClaudePlanUsageResponse["rate_limits"]>["extra_usage"]
  >,
) {
  const { monthly_limit: limit, used_credits: used } = extraUsage;
  if (
    !extraUsage.is_enabled ||
    typeof limit !== "number" ||
    typeof used !== "number"
  ) {
    return null;
  }

  return {
    usedAmount: used / 100,
    limitAmount: limit / 100,
    currency: extraUsage.currency || "USD",
  };
}

export function mapClaudePlanUsage(
  response: ClaudePlanUsageResponse | null | undefined,
  updatedAt: string,
): AgentRateLimitsRecord | null {
  const limits = response?.rate_limits;
  if (!response?.rate_limits_available || !limits) {
    return null;
  }

  const windows = [
    toWindow("five-hour", limits.five_hour),
    toWindow("weekly", limits.seven_day),
    toWindow("weekly", limits.seven_day_opus, "Opus"),
    toWindow("weekly", limits.seven_day_sonnet, "Sonnet"),
    ...(limits.model_scoped ?? []).map((window) =>
      toWindow("weekly", window, window.display_name),
    ),
  ].filter((window): window is AgentRateLimitWindow => window !== null);

  const credits = limits.extra_usage ? readCredits(limits.extra_usage) : null;
  if (!windows.length && !credits) {
    return null;
  }

  return {
    windows,
    updatedAt,
    ...(response.subscription_type
      ? { planLabel: response.subscription_type }
      : {}),
    ...(credits ? { credits } : {}),
  };
}
