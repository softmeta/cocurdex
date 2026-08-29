import {
  isContextFolderAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { ChevronLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib";
import { useVerticalDrag } from "./use-vertical-drag";

export interface UserMessageAnchor {
  id: string;
  attachments: MessageAttachment[];
  content: string;
}

function getAnchorPreview(message: UserMessageAnchor) {
  const trimmedContent = message.content.trim();

  if (trimmedContent.length > 0) {
    return trimmedContent;
  }

  if (message.attachments.length > 0) {
    const attachment = message.attachments[0];
    if (attachment && isContextFolderAttachment(attachment)) {
      const folderName =
        attachment.folderPath.split("/").pop() ?? "Attached folder";
      return `Attached ${folderName}`;
    }

    if (attachment && !isImageAttachment(attachment)) {
      const fileName = attachment.filePath.split("/").pop() ?? "Attached file";
      return `Attached ${fileName}`;
    }

    return "Attached file";
  }

  return "Empty message";
}

const panelClassName = cn(
  "pointer-events-auto w-9 rounded-full border border-chat-border-soft bg-chat-surface-raised/90 p-1 shadow-chat-soft backdrop-blur",
);

const promptButtonClassName = cn(
  "relative flex size-7 items-center justify-center rounded-full cursor-pointer text-left transition-colors duration-150",
);

export function UserMessageNavigation({
  activeMessageId,
  messages,
  onSelect,
}: {
  activeMessageId: string | null;
  messages: UserMessageAnchor[];
  onSelect(messageId: string): void;
}) {
  const { t } = useTranslation("agent");
  const [isExpanded, setIsExpanded] = useState(false);
  // Held as state (not a ref) so the tooltips re-render once the list mounts
  // and can use it as their collision boundary. This is the scroll viewport,
  // not the whole rail: a trigger scrolled past the viewport edge still has a
  // rect inside the rail, so bounding to the rail let a preview fly far off the
  // visible rows while flicking through them.
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const {
    offsetY,
    rootRef: asideRef,
    startDrag,
    consumeDragClick,
  } = useVerticalDrag<HTMLElement>();
  const scrollActiveButtonIntoView = useCallback(
    (node: HTMLButtonElement | null) => {
      if (!isExpanded || !node) {
        return;
      }

      node.scrollIntoView({ block: "nearest" });
    },
    [isExpanded],
  );

  if (messages.length < 2) {
    return null;
  }

  return (
    <aside
      ref={asideRef}
      className="pointer-events-auto absolute start-0 top-1/2 z-20 cursor-grab active:cursor-grabbing"
      style={{
        transform: `translateY(calc(-50% + ${offsetY}px))`,
      }}
      onMouseDown={(event) => startDrag(event.clientY)}
    >
      {/* Keep expanded rail inset in sync with JumpControls (start-2). */}
      <div className={cn("transition-all", isExpanded && "ms-2")}>
        {isExpanded ? (
          <div className={panelClassName}>
            <div className="flex max-h-[min(50vh,22rem)] flex-col items-center gap-1 overflow-hidden">
              <button
                aria-label={t("navigation.collapse")}
                className={cn(
                  "flex size-7 cursor-pointer items-center justify-center rounded-full text-chat-fg-muted transition-colors duration-150 hover:bg-chat-surface-subtle hover:text-chat-fg",
                )}
                onClick={() => {
                  if (consumeDragClick()) return;
                  setIsExpanded(false);
                }}
                type="button"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <div className="h-px w-5 bg-chat-border-soft" />
              <div
                className="scrollbar-hide flex max-h-[9.5rem] min-h-0 flex-col items-center gap-1 overflow-y-auto overscroll-contain pr-px"
                ref={setListElement}
              >
                {messages.map((message, index) => {
                  const isActive = message.id === activeMessageId;

                  return (
                    <Tooltip key={message.id}>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={t("navigation.jumpToPrompt", {
                            index: String(index + 1),
                          })}
                          aria-current={isActive ? "true" : undefined}
                          className={cn(
                            promptButtonClassName,
                            isActive
                              ? "text-chat-fg"
                              : "text-chat-fg-muted hover:text-chat-fg",
                          )}
                          onClick={() => {
                            if (consumeDragClick()) return;
                            onSelect(message.id);
                          }}
                          ref={isActive ? scrollActiveButtonIntoView : null}
                          type="button"
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold",
                              isActive
                                ? "border-chat-border-accent bg-accent text-accent-foreground shadow-sm"
                                : "border-chat-border-soft text-chat-fg-subtle",
                            )}
                          >
                            {index + 1}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        className="max-w-56 rounded-panel border border-chat-border-soft bg-chat-surface-raised/95 px-3 py-1.5 text-xs leading-5 text-chat-fg shadow-chat-soft backdrop-blur"
                        // Confine the preview to the visible rows: the align
                        // axis (vertical for side="right") shifts to stay
                        // inside, while the side axis is left alone so the
                        // narrow rail never flips the popup onto the trigger.
                        collisionAvoidance={{
                          align: "shift",
                          fallbackAxisSide: "none",
                          side: "none",
                        }}
                        collisionBoundary={listElement ?? undefined}
                        hideArrow
                        side="right"
                        sideOffset={6}
                      >
                        <span className="line-clamp-2 break-words">
                          {getAnchorPreview(message)}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <button
            aria-label={t("navigation.expand")}
            className={cn(
              "pointer-events-auto h-16 w-2 cursor-pointer rounded-e-card border border-s-0 border-chat-border-soft bg-chat-surface-raised/90 shadow-chat-soft backdrop-blur transition-all duration-150 hover:bg-chat-surface-subtle",
            )}
            onClick={() => {
              if (consumeDragClick()) return;
              setIsExpanded(true);
            }}
            type="button"
          />
        )}
      </div>
    </aside>
  );
}
