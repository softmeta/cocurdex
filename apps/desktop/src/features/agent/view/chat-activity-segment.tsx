import { formatDurationMs } from "@cocurdex/client-runtime";
import { CircleStop } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useChatPresentation } from "../chat-display";
import {
  getSingleToolCall,
  hasActiveToolCall,
  summarizeActivity,
} from "./activity-summary";
import { formatActivitySummary } from "./activity-summary-label";
import { ActivityBlock } from "./chat-activity-block";
import { isActivityHeaderBusy } from "./chat-activity-state";
import { isReasoningMessage } from "./chat-message-utils";
import type { TimelineGroup } from "./chat-timeline";

function isInterimReply(item: TimelineGroup) {
  return item.kind === "message" && !isReasoningMessage(item.message);
}

export function ActivitySegment({
  durationMs,
  isLastSegment,
  isLiveConversation,
  isTurnWork,
  items,
  liveLabel,
  renderItem,
}: {
  durationMs?: number;
  isLastSegment: boolean;
  isLiveConversation: boolean;
  isTurnWork: boolean;
  items: TimelineGroup[];
  liveLabel?: ReactNode;
  renderItem(item: TimelineGroup, nested: boolean): ReactNode;
}) {
  const { t } = useTranslation("agent");
  const presentation = useChatPresentation();
  const singleItem = items[0];

  if (!liveLabel && !isTurnWork && singleItem && getSingleToolCall(items)) {
    return renderItem(singleItem, true);
  }

  const summary = summarizeActivity(items);
  const turnDurationKey =
    presentation === "chat" || summary.kind === "reasoning"
      ? "activity.thoughtFor"
      : "activity.workedFor";
  const label =
    isTurnWork && durationMs !== undefined
      ? t(turnDurationKey, { duration: formatDurationMs(durationMs) })
      : formatActivitySummary(summary);

  return (
    <ActivityBlock
      busy={isActivityHeaderBusy({
        hasActiveToolCall: hasActiveToolCall(items),
        isLastSegment,
        isLiveConversation,
      })}
      label={label}
      liveLabel={liveLabel}
      stateKey={`activity:${items[0]?.id}`}
      variant={isTurnWork ? "turn" : "step"}
    >
      {items.map((item) => {
        if (isTurnWork) {
          return (
            <TimelineItem key={item.id}>
              {isInterimReply(item) ? (
                <TimelineReply>{renderItem(item, true)}</TimelineReply>
              ) : (
                renderItem(item, true)
              )}
            </TimelineItem>
          );
        }
        return isInterimReply(item) ? (
          <div className="py-1.5 first:pt-0" key={item.id}>
            {renderItem(item, true)}
          </div>
        ) : (
          renderItem(item, true)
        );
      })}
    </ActivityBlock>
  );
}

function TimelineItem({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0" data-timeline-item="">
      {children}
    </div>
  );
}

function TimelineReply({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mx-1.5 ps-7 pe-1.5" data-timeline-row="">
      <span aria-hidden className="activity-timeline-dot" />
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

export function TurnStoppedNote() {
  const { t } = useTranslation("agent");

  return (
    <div className="flex items-center gap-2 text-meta text-chat-fg-muted">
      <CircleStop className="size-3.5 shrink-0" />
      <span>{t("activity.stopped")}</span>
    </div>
  );
}
