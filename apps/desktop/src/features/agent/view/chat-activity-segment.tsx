import { CircleStop } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  getSingleToolCall,
  hasActiveToolCall,
  summarizeActivity,
} from "./activity-summary";
import { formatActivitySummary } from "./activity-summary-label";
import { ActivityBlock } from "./chat-activity-block";
import { formatDurationMs, isActivityHeaderBusy } from "./chat-activity-state";
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
  renderItem,
}: {
  durationMs?: number;
  isLastSegment: boolean;
  isLiveConversation: boolean;
  isTurnWork: boolean;
  items: TimelineGroup[];
  renderItem(item: TimelineGroup, nested: boolean): ReactNode;
}) {
  const { t } = useTranslation("agent");
  const singleItem = items[0];

  if (!isTurnWork && singleItem && getSingleToolCall(items)) {
    return renderItem(singleItem, true);
  }

  const label =
    isTurnWork && durationMs !== undefined
      ? t("activity.workedFor", { duration: formatDurationMs(durationMs) })
      : formatActivitySummary(summarizeActivity(items));

  return (
    <ActivityBlock
      busy={isActivityHeaderBusy({
        hasActiveToolCall: hasActiveToolCall(items),
        isLastSegment,
        isLiveConversation,
      })}
      label={label}
      stateKey={`activity:${items[0]?.id}`}
      variant={isTurnWork ? "turn" : "step"}
    >
      {items.map((item) =>
        isInterimReply(item) ? (
          <div className="py-1.5 first:pt-0" key={item.id}>
            {renderItem(item, true)}
          </div>
        ) : (
          renderItem(item, true)
        ),
      )}
    </ActivityBlock>
  );
}

export function TurnStoppedNote() {
  const { t } = useTranslation("agent");

  return (
    <div className="flex items-center gap-2 px-1.5 text-meta text-chat-fg-muted">
      <CircleStop className="size-3.5 shrink-0" />
      <span>{t("activity.stopped")}</span>
    </div>
  );
}
