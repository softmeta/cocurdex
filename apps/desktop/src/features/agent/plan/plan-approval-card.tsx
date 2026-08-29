import type {
  AgentPlanApprovalDecision,
  AgentPlanApprovalRecord,
} from "@cocurdex/shared";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import { PlanApprovalFeedback } from "./plan-approval-feedback";

// Collapsed: readable preview without eating the dock.
// Expanded: taller for review, still capped. The whole card overlays upward
// so the chat flex layout does not reflow (and the header stays visible).
const PLAN_BODY_COLLAPSED_CLASS = "max-h-[min(36dvh,18rem)]";
const PLAN_BODY_EXPANDED_CLASS = "max-h-[min(60dvh,32rem)]";

export function PlanApprovalCard({
  approval,
  onResolve,
}: {
  approval: AgentPlanApprovalRecord;
  onResolve?(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<void> | void;
}) {
  const { t } = useTranslation("agent");
  const [isResolving, setIsResolving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [contentOverflows, setContentOverflows] = useState(false);

  const measureBody = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }

    const update = () => {
      // 2px slack avoids flicker from subpixel rounding.
      setContentOverflows(node.scrollHeight > node.clientHeight + 2);
    };
    update();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Resolved approvals leave no card behind: the dock only ever shows the one
  // parked decision, and the agent's own tool-call row keeps the history.
  if (approval.status !== "pending") {
    return null;
  }

  const planContent = approval.planContent;
  // Show expand when content is clipped, or when already expanded (so collapse
  // remains available after the viewport grows past the content height).
  const showExpandToggle = contentOverflows || isExpanded;

  const handleResolve = async (decision: AgentPlanApprovalDecision) => {
    if (isResolving) {
      return;
    }

    setIsResolving(true);
    try {
      await onResolve?.(approval.id, decision);
    } finally {
      setIsResolving(false);
    }
  };

  // One line: title + pending chip. The plan body carries the real content.
  const header = (
    <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-control bg-chat-status-pending-bg text-chat-status-pending-fg">
        <ClipboardList className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-body font-medium text-chat-fg">
          {planContent
            ? t("planApproval.heading")
            : t("planApproval.emptyHeading")}
        </span>
        <span className="shrink-0 rounded-full bg-chat-status-pending-bg px-1.5 py-px text-meta font-medium text-chat-status-pending-fg">
          {t("planApproval.pending")}
        </span>
      </div>
    </div>
  );

  const planBody = (expanded: boolean) =>
    planContent ? (
      <div className="px-3 pb-2">
        <div
          className={cn(
            "overflow-y-auto overscroll-contain rounded-control bg-chat-surface-subtle px-2.5 py-2",
            expanded ? PLAN_BODY_EXPANDED_CLASS : PLAN_BODY_COLLAPSED_CLASS,
          )}
          // Only the in-flow (collapsed) shell is measured for overflow.
          ref={expanded ? undefined : measureBody}
        >
          <MarkdownRenderer content={planContent} tone="assistant" />
        </div>
        {showExpandToggle ? (
          <div className="mt-1.5 flex justify-center">
            <Button
              className="h-7 gap-1 text-meta text-chat-fg-muted"
              onClick={() => setIsExpanded((value) => !value)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3.5" />
                  {t("planApproval.collapse")}
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  {t("planApproval.expandMore")}
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>
    ) : null;

  const footer = isRequestingChanges ? (
    <PlanApprovalFeedback
      disabled={isResolving}
      onCancel={() => setIsRequestingChanges(false)}
      onSubmit={(feedback) =>
        handleResolve({
          outcome: "cancelled",
          feedback: feedback.length > 0 ? feedback : null,
        })
      }
    />
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-1.5 border-chat-border-soft border-t px-3 py-2">
      {planContent ? (
        <Button
          className="me-auto text-chat-fg-muted"
          onClick={() => {
            void navigator.clipboard.writeText(planContent).catch(() => {});
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Copy className="size-3.5" />
          {t("planApproval.copy")}
        </Button>
      ) : null}
      <Button
        disabled={isResolving}
        onClick={() => void handleResolve({ outcome: "abandoned" })}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X className="size-3.5" />
        {t("planApproval.abandon")}
      </Button>
      <Button
        disabled={isResolving}
        onClick={() => setIsRequestingChanges(true)}
        size="sm"
        type="button"
        variant="secondary"
      >
        {t("planApproval.requestChanges")}
      </Button>
      <Button
        disabled={isResolving}
        onClick={() => void handleResolve({ outcome: "approved" })}
        size="sm"
        type="button"
      >
        <Check className="size-3.5" />
        {t("planApproval.approve")}
      </Button>
    </div>
  );

  return (
    <div className={cn("relative w-full", isExpanded && "z-30")}>
      {/* In-flow shell: always the collapsed footprint so chat flex height
          does not jump when the plan body grows. */}
      <article
        className={cn(
          "w-full overflow-hidden rounded-panel border border-chat-border bg-chat-surface-raised text-chat-fg shadow-chat-soft",
          isExpanded && "invisible",
        )}
      >
        {header}
        {planBody(false)}
        {footer}
      </article>

      {/* Expanded: full card (header + taller body + footer) overlays upward
          from the same bottom edge — header stays on the card, chat is only
          covered, not reflowed. */}
      {isExpanded ? (
        <article className="absolute inset-x-0 bottom-0 z-40 w-full overflow-hidden rounded-panel border border-chat-border bg-chat-surface-raised text-chat-fg shadow-chat-soft">
          {header}
          {planBody(true)}
          {footer}
        </article>
      ) : null}
    </div>
  );
}
