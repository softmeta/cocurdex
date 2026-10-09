import type { ComponentProps, RefObject } from "react";
import { TranscriptStateProvider } from "../../transcript-state";
import { ChatConversationItem } from "../chat-conversation-item";
import type { ConversationGroup } from "../chat-timeline";
import { useElementHeight } from "./use-element-height";
import {
  type ChatTimelineScrollHandle,
  useVirtualTimeline,
} from "./use-virtual-timeline";
import { getAnchoredConversationMinHeight } from "./virtual-timeline-model";

type ChatVirtualTimelineProps = Omit<
  ComponentProps<typeof ChatConversationItem>,
  "conversationGroup" | "isLatestConversation"
> & {
  anchoredPromptId?: string | null;
  groups: ConversationGroup[];
  scrollRef: RefObject<ChatTimelineScrollHandle | null>;
  userMessageRefs: RefObject<Record<string, HTMLDivElement | null>>;
  viewportElement: HTMLDivElement | null;
};

export function ChatVirtualTimeline({
  activity,
  anchoredPromptId = null,
  groups,
  scrollRef,
  userMessageRefs,
  viewportElement,
  ...conversationProps
}: ChatVirtualTimelineProps) {
  const { items, rootRef, scrollMargin, totalSize, updateFocus, virtualizer } =
    useVirtualTimeline({
      groups,
      scrollRef,
      userMessageRefs,
      viewportElement,
    });
  const viewportHeight = useElementHeight(viewportElement);
  const rows = items.map((item) => ({
    index: item.index,
    top: item.start - scrollMargin,
  }));
  return (
    <TranscriptStateProvider>
      <div
        className="relative"
        data-testid="chat-timeline"
        onBlurCapture={(event) => updateFocus(event.relatedTarget)}
        onFocusCapture={(event) => updateFocus(event.target)}
        ref={rootRef}
        style={{ height: totalSize }}
      >
        {rows.map(({ index, top }) => {
          const group = groups[index];
          const isLatestConversation = index === groups.length - 1;
          const isAnchored =
            isLatestConversation &&
            conversationProps.isRunning &&
            anchoredPromptId !== null &&
            group.prompt?.id === anchoredPromptId;
          return (
            <div
              className="absolute inset-x-0 top-0 w-full"
              data-conversation-id={group.id}
              data-index={index}
              key={group.id}
              ref={virtualizer.measureElement}
              style={{
                minHeight: isAnchored
                  ? getAnchoredConversationMinHeight(viewportHeight)
                  : undefined,
                transform: `translateY(${top}px)`,
              }}
            >
              <ChatConversationItem
                {...conversationProps}
                activity={isLatestConversation ? activity : undefined}
                conversationGroup={group}
                isLatestConversation={isLatestConversation}
              />
            </div>
          );
        })}
      </div>
    </TranscriptStateProvider>
  );
}
