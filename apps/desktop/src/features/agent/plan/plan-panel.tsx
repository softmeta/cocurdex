import type { AgentPlanStep } from "@cocurdex/shared";
import { Check, ChevronDown, Circle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import type { SessionPlan } from "./plan-store";

const statusIcon: Record<
  AgentPlanStep["status"],
  typeof Check | typeof Circle | typeof Loader2
> = {
  completed: Check,
  in_progress: Loader2,
  pending: Circle,
};

// Live agent task list (ACP plan / Grok `todo_write`). Rendered in the
// composer dock so it stays visible while the transcript scrolls — not as a
// mid-stream message card (that buried the list under tool output).
//
// Two distinct affordances: collapsing keeps the header row (and progress)
// docked so the user can reopen the list any time, dismissing hides the panel
// entirely until the agent pushes the next plan update.
export function PlanPanel({
  plan,
  collapsed = false,
  onToggleCollapsed,
  onDismiss,
}: {
  plan: SessionPlan;
  collapsed?: boolean;
  onToggleCollapsed?(): void;
  onDismiss?(): void;
}) {
  const { t } = useTranslation("agent");

  if (plan.steps.length === 0 && !plan.explanation) {
    return null;
  }

  const completedCount = plan.steps.filter(
    (step) => step.status === "completed",
  ).length;
  const totalCount = plan.steps.length;
  const activeStep = plan.steps.find((step) => step.status === "in_progress");
  const progressLabel =
    totalCount > 0
      ? t("plan.progress", {
          count: totalCount,
          done: String(completedCount),
        })
      : null;

  // Opaque raised surface, same as the other dock cards: the panel floats over
  // the tail of the transcript, so a translucent fill bleeds text through.
  return (
    <section
      aria-label={t("plan.label")}
      className={cn(
        "w-full rounded-panel border border-chat-border bg-chat-surface-raised px-3 text-chat-fg shadow-chat-soft",
        // Collapsed is a thin status strip: it covers the tail of the
        // transcript, so it gives back every pixel it does not need.
        collapsed ? "py-1" : "py-2.5",
      )}
    >
      <div className={cn("flex items-center gap-2", !collapsed && "mb-1.5")}>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("plan.expand") : t("plan.collapse")}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          onClick={onToggleCollapsed}
          type="button"
        >
          <span className="shrink-0 text-meta font-medium uppercase tracking-[0.18em] text-chat-fg-muted">
            {t("plan.label")}
          </span>
          {collapsed && activeStep ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-meta text-chat-fg">
              <Loader2
                aria-label={t("toolCalls.running")}
                className="size-3.5 shrink-0 animate-spin"
                role="status"
              />
              <span className="min-w-0 truncate">{activeStep.step}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-meta tabular-nums text-chat-fg-muted">
            {progressLabel}
            {/* The panel is docked at the bottom, so the list grows upward:
                up means "opens", down means "closes". Vertical rotation keeps
                the icon direction-neutral in RTL. */}
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </span>
        </button>
        <Button
          aria-label={t("plan.dismiss")}
          className="size-5 shrink-0 text-chat-fg-muted"
          onClick={onDismiss}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {collapsed ? null : <PlanBody plan={plan} />}
    </section>
  );
}

function PlanBody({ plan }: { plan: SessionPlan }) {
  return (
    <>
      {plan.explanation ? (
        <p className="mb-1.5 text-body leading-5 text-chat-fg-secondary">
          {plan.explanation}
        </p>
      ) : null}
      {/* Cap height so a long todo list does not shove the composer off-screen. */}
      <ol className="max-h-40 space-y-1 overflow-y-auto overscroll-contain">
        {plan.steps.map((step, index) => {
          const Icon = statusIcon[step.status];

          return (
            <li
              className="flex gap-2 text-body leading-5"
              // biome-ignore lint/suspicious/noArrayIndexKey: the agent replaces the whole list on every `todo_write` and two steps can share the same text, so position is the only stable identity. Rows hold no local state.
              key={`${index}-${step.step}`}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-3.5 shrink-0 text-chat-fg-muted",
                  step.status === "in_progress" && "animate-spin text-chat-fg",
                )}
              />
              <span
                className={cn(
                  "min-w-0",
                  step.status === "completed"
                    ? "text-chat-fg-muted line-through"
                    : "text-chat-fg-secondary",
                )}
              >
                {index + 1}. {step.step}
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
