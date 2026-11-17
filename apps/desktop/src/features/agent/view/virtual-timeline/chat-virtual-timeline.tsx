import type { ComponentProps, RefObject } from "react";
import { cn } from "@/lib";
import { useChatPresentation } from "../../chat-display";
import { TranscriptStateProvider } from "../../transcript-state";
import { ChatConversationItem } from "../chat-conversation-item";
import type { ConversationGroup } from "../chat-timeline";
import { separatorTimeBefore } from "../conversation-time";
import { ConversationTimeSeparator } from "../conversation-time-separator";
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
  const { items, rootRef, totalSize, updateFocus, virtualizer } =
    useVirtualTimeline({
      groups,
      scrollRef,
      userMessageRefs,
      viewportElement,
    });
  const showsTimeSeparators = useChatPresentation() === "assistant";
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
        {items.map(({ index }) => {
          const group = groups[index];
          const isLatestConversation = index === groups.length - 1;
          const separatorTime = showsTimeSeparators
            ? separatorTimeBefore(groups[index - 1], group)
            : null;
          return (
            <div
              className="absolute inset-x-0 top-0 w-full"
              data-conversation-id={group.id}
              data-index={index}
              key={group.id}
              ref={virtualizer.measureElement}
            >
              {separatorTime === null ? null : (
                <ConversationTimeSeparator time={separatorTime} />
              )}
              <div
                className={cn(isLatestConversation && "pb-6")}
                data-transcript-content-end={
                  isLatestConversation ? "" : undefined
                }
              >
                <ChatConversationItem
                  {...conversationProps}
                  activity={isLatestConversation ? activity : undefined}
                  conversationGroup={group}
                  isLatestConversation={isLatestConversation}
                />
              </div>
            </div>
          );
        })}
      </div>
    </TranscriptStateProvider>
  );
}
