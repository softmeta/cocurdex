import type {
  AgentContextBreakdownGroup,
  AgentContextBreakdownItem,
  AgentContextBreakdownRecord,
  AgentRateLimitsRecord,
  AgentRateLimitWindow,
} from "@cocurdex/shared";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  PopoverContent,
  Separator,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { formatTokenCount } from "./context-token-format";

function formatPercent(tokens: number, total: number) {
  if (!total) {
    return null;
  }
  const percent = (tokens / total) * 100;
  return percent >= 0.1 ? `${percent.toFixed(1)}%` : "<0.1%";
}

// Fill severity: the hue tracks how close the meter is to its limit, so a
// glance at the panel is enough. The agent's own ANSI colors are ignored —
// they carry no meaning in the GUI.
function usageFillClassName(percent: number) {
  if (percent >= 90) {
    return "bg-destructive";
  }
  if (percent >= 75) {
    return "bg-status-warning";
  }
  return "bg-primary";
}

// Linear meter shared by every row in the panel.
function UsageBar({
  percent,
  className,
  // Breakdown rows show a share of the window, not a distance to a limit, so
  // they opt out of the severity hue.
  share = false,
}: {
  percent: number;
  className?: string;
  share?: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          share ? "bg-primary" : usageFillClassName(clamped),
        )}
        style={{ inlineSize: `${clamped}%` }}
      />
    </div>
  );
}

function UsageRow({
  label,
  value,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <Text
        className="min-w-0 flex-1 truncate"
        size="meta"
        tone={tone === "muted" ? "muted" : "default"}
      >
        {label}
      </Text>
      <Text className="shrink-0 tabular-nums" size="meta" tone="muted">
        {value}
      </Text>
    </div>
  );
}

function BreakdownItemRow({
  item,
  total,
}: {
  item: AgentContextBreakdownItem;
  total: number;
}) {
  const percent = formatPercent(item.tokens, total);

  return (
    <UsageRow
      label={
        <span className="truncate" title={item.name}>
          {item.name}
          {item.detail ? (
            <span className="text-muted-foreground"> · {item.detail}</span>
          ) : null}
        </span>
      }
      tone="muted"
      value={`${formatTokenCount(item.tokens)}${percent ? ` · ${percent}` : ""}`}
    />
  );
}

// One reported group (memory files, MCP tools, skills, …). Collapsed by
// default: a session can carry dozens of rows, and the panel is a glance
// surface, not a report.
function BreakdownGroupSection({
  group,
  total,
}: {
  group: AgentContextBreakdownGroup;
  total: number;
}) {
  const { t } = useTranslation("agent");
  const meta = [
    group.summary,
    formatTokenCount(group.tokens),
    formatPercent(group.tokens, total),
  ]
    .filter(Boolean)
    .join(" · ");

  if (!group.items.length) {
    return (
      <div className="px-1 py-0.5">
        <UsageRow
          label={t(`contextBreakdown.groups.${group.id}`)}
          value={meta}
        />
      </div>
    );
  }

  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded-control px-1 py-0.5 text-start hover:bg-accent">
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
        <div className="min-w-0 flex-1">
          <UsageRow
            label={t(`contextBreakdown.groups.${group.id}`)}
            value={meta}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-0.5 ps-5 pe-1 pt-1">
        {group.items.map((item) => (
          <BreakdownItemRow
            item={item}
            key={`${item.name}-${item.detail}`}
            total={total}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function RateLimitSection({
  rateLimits,
}: {
  rateLimits: AgentRateLimitsRecord;
}) {
  const { t, i18n } = useTranslation("agent");
  const getWindowLabel = (window: AgentRateLimitWindow) => {
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
  };

  const formatCredits = (amount: number, currency: string) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency,
    }).format(amount);

  return (
    <section className="grid gap-2 px-1">
      <Text size="meta" tone="muted">
        {rateLimits.planLabel
          ? `${t("rateLimits.title")} · ${rateLimits.planLabel}`
          : t("rateLimits.title")}
      </Text>
      {rateLimits.windows.map((window) => {
        const reset = window.resetsAt
          ? new Intl.DateTimeFormat(i18n.language, {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(window.resetsAt))
          : null;
        const usedPercent = Math.round(
          Math.max(0, Math.min(100, window.usedPercent)),
        );
        const baseLabel = getWindowLabel(window);

        return (
          <div className="grid gap-1" key={`${window.kind}-${window.label}`}>
            <UsageRow
              label={
                window.label ? `${baseLabel} · ${window.label}` : baseLabel
              }
              value={
                reset
                  ? `${t("rateLimits.resets", { reset })} · ${usedPercent}%`
                  : `${usedPercent}%`
              }
            />
            <UsageBar percent={usedPercent} />
          </div>
        );
      })}
      {rateLimits.credits ? (
        <div className="grid gap-1">
          <UsageRow
            label={t("rateLimits.credits")}
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
          <UsageBar
            percent={
              rateLimits.credits.limitAmount > 0
                ? (rateLimits.credits.usedAmount /
                    rateLimits.credits.limitAmount) *
                  100
                : 0
            }
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Context usage panel anchored to the footer ring. Every agent gets the window
 * meter and (when reported) plan quota; agents that also report how the window
 * is spent — currently the Claude Agent SDK, the same data `/context` prints —
 * get the composition sections.
 */
export function ContextUsagePopoverContent({
  used,
  contextLimit,
  rateLimits,
  breakdown,
}: {
  used: number | null;
  contextLimit: number | null;
  rateLimits?: AgentRateLimitsRecord;
  breakdown?: AgentContextBreakdownRecord;
}) {
  const { t } = useTranslation("agent");
  const total = contextLimit ?? breakdown?.maxTokens ?? null;
  const usedTokens = used ?? breakdown?.totalTokens ?? null;
  const percent =
    usedTokens != null && total
      ? Math.min(100, (usedTokens / total) * 100)
      : null;
  // The breakdown's own window size drives its shares — the agent reported the
  // slices against it, and the session's contextLimit may come from elsewhere.
  const breakdownTotal = breakdown
    ? breakdown.maxTokens || breakdown.totalTokens
    : 0;

  const windowSummary = (
    <div className="grid gap-1">
      <UsageRow
        label={t("contextWindow.currentContext")}
        value={`${usedTokens != null ? formatTokenCount(usedTokens) : "—"} / ${
          total ? formatTokenCount(total) : "—"
        }${percent != null ? ` (${percent.toFixed(1)}%)` : ""}`}
      />
      <UsageBar percent={percent ?? 0} />
    </div>
  );

  return (
    <PopoverContent
      align="end"
      className="max-h-[70vh] w-[22rem] max-w-[90vw] overflow-y-auto"
      side="top"
    >
      {/* The composition is one level down: the panel opens as a glance
          surface, and only the chevron pulls in the full `/context` listing. */}
      {breakdown ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded-control px-1 py-0.5 text-start hover:bg-accent">
            <div className="min-w-0 flex-1">{windowSummary}</div>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-2 pt-2">
            {breakdown.categories.map((category) => (
              <div className="grid gap-1 px-1" key={category.name}>
                <BreakdownItemRow item={category} total={breakdownTotal} />
                <UsageBar
                  percent={(category.tokens / breakdownTotal) * 100}
                  share
                />
              </div>
            ))}
            {breakdown.groups.length ? (
              <div className="grid gap-0.5">
                {breakdown.groups.map((group) => (
                  <BreakdownGroupSection
                    group={group}
                    key={group.id}
                    total={breakdownTotal}
                  />
                ))}
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <section className="px-1">{windowSummary}</section>
      )}

      {rateLimits ? (
        <>
          <Separator />
          <RateLimitSection rateLimits={rateLimits} />
        </>
      ) : null}
    </PopoverContent>
  );
}
