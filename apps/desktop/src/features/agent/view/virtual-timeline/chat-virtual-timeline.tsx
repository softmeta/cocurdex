import type { ComponentProps, RefObject } from "react";
import { TranscriptStateProvider } from "../../transcript-state";
import { ChatConversationItem } from "../chat-conversation-item";
import type { ConversationGroup } from "../chat-timeline";
import {
  type ChatTimelineScrollHandle,
  useVirtualTimeline,
} from "./use-virtual-timeline";

type ChatVirtualTimelineProps = Omit<
  ComponentProps<typeof ChatConversationItem>,
  "conversationGroup" | "isLatestConversation"
> & {
  groups: ConversationGroup[];
  scrollRef: RefObject<ChatTimelineScrollHandle | null>;
  userMessageRefs: RefObject<Record<string, HTMLDivElement | null>>;
  viewportElement: HTMLDivElement | null;
};

export function ChatVirtualTimeline({
  activity,
  groups,
  scrollRef,
  userMessageRefs,
  viewportElement,
  ...conversationProps
}: ChatVirtualTimelineProps) {
  const { items, rootRef, scrollMargin, updateFocus, virtualizer } =
    useVirtualTimeline({
      groups,
      scrollRef,
      userMessageRefs,
      viewportElement,
    });
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
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map(({ index, top }) => {
          const group = groups[index];
          const isLatestConversation = index === groups.length - 1;
          return (
            <div
              className="absolute inset-x-0 top-0 w-full"
              data-conversation-id={group.id}
              data-index={index}
              key={group.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${top}px)` }}
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
