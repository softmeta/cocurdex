import type {
  AgentRateLimitsRecord,
  AgentRateLimitWindow,
} from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CircularProgress, Spinner, Text } from "@/components/ui";

function usageRingClassName(percent: number) {
  if (percent >= 90) {
    return "text-destructive";
  }
  if (percent >= 75) {
    return "text-status-warning";
  }
  return "text-primary";
}

function RateLimitRing({
  label,
  percent,
  value,
}: {
  label: string;
  percent: number;
  value: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <CircularProgress
        aria-label={`${label} ${clamped}%`}
        className="size-4"
        indicatorClassName={usageRingClassName(clamped)}
        value={clamped}
      />
      <Text
        className="min-w-0 truncate"
        size="meta"
        title={`${label} ${value}`}
        tone="muted"
      >
        {label}
        <span className="tabular-nums"> {value}</span>
      </Text>
    </div>
  );
}

function windowLabel(window: AgentRateLimitWindow, t: TFunction<"agent">) {
  const base = (() => {
    switch (window.kind) {
      case "five-hour":
        return t("rateLimits.windows.fiveHour");
      case "weekly":
        return t("rateLimits.windows.weekly");
      case "monthly":
        return t("rateLimits.windows.monthly");
      case "primary":
        return t("rateLimits.windows.primary");
      case "secondary":
        return t("rateLimits.windows.secondary");
    }
  })();
  return window.label ? `${base} · ${window.label}` : base;
}

export function AdapterRateLimitsLoading({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mt-1.5 flex items-center gap-1.5"
    >
      <Spinner aria-hidden="true" size="xs" />
      <Text size="meta" tone="muted">
        {label}
      </Text>
    </div>
  );
}

export function AdapterRateLimits({
  rateLimits,
}: {
  rateLimits: AgentRateLimitsRecord;
}) {
  const { t, i18n } = useTranslation("agent");
  const formatCredits = (amount: number, currency: string) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency,
    }).format(amount);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
      {rateLimits.windows.map((window) => {
        const usedPercent = Math.round(
          Math.max(0, Math.min(100, window.usedPercent)),
        );
        const reset = window.resetsAt
          ? new Intl.DateTimeFormat(i18n.language, {
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(window.resetsAt))
          : null;
        const label = windowLabel(window, t);

        return (
          <RateLimitRing
            key={`${window.kind}-${window.label ?? ""}`}
            label={label}
            percent={usedPercent}
            value={
              reset
                ? `${usedPercent}% · ${t("rateLimits.resets", { reset })}`
                : `${usedPercent}%`
            }
          />
        );
      })}
      {rateLimits.credits ? (
        <RateLimitRing
          label={t("rateLimits.credits")}
          percent={
            rateLimits.credits.limitAmount > 0
              ? (rateLimits.credits.usedAmount /
                  rateLimits.credits.limitAmount) *
                100
              : 0
          }
          value={t("rateLimits.creditsValue", {
            limit: formatCredits(
              rateLimits.credits.limitAmount,
              rateLimits.credits.currency,
            ),
            used: formatCredits(
              rateLimits.credits.usedAmount,
              rateLimits.credits.currency,
            ),
          })}
        />
      ) : null}
    </div>
  );
}
