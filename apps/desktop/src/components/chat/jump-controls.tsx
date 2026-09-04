import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useVerticalDrag } from "./use-vertical-drag";

// A single jump button on the left rail near the bottom of the message area,
// just above the composer. Jump-to-top and jump-to-latest are mutually
// exclusive, so they share one fixed slot. Draggable vertically to reposition.
// Shared by agent ChatView and pure-chat ConversationDetail.
export function JumpControls({
  showJumpToTop,
  showJumpToLatest,
  onJumpToTop,
  onJumpToLatest,
}: {
  showJumpToTop: boolean;
  showJumpToLatest: boolean;
  onJumpToTop(): void;
  onJumpToLatest(): void;
}) {
  // Prefer common.* so both modes share one string; agent.* kept as fallback
  // for older locale packs that have not been re-extracted yet.
  const { t } = useTranslation(["common", "agent"]);
  const { offsetY, rootRef, startDrag, consumeDragClick } =
    useVerticalDrag<HTMLDivElement>();

  if (!showJumpToTop && !showJumpToLatest) {
    return null;
  }

  const handleClick = (action: () => void) => {
    if (consumeDragClick()) {
      return;
    }
    action();
  };

  const jumpControl = showJumpToTop
    ? {
        Icon: ArrowUpToLine,
        label: t("jumpToTop", {
          ns: "common",
          defaultValue: t("agent:jumpToTop"),
        }),
        onJump: onJumpToTop,
      }
    : {
        Icon: ArrowDownToLine,
        label: t("jumpToLatest", {
          ns: "common",
          defaultValue: t("agent:jumpToLatest"),
        }),
        onJump: onJumpToLatest,
      };
  const { Icon, label, onJump } = jumpControl;

  // Same start inset as expanded UserMessageNavigation (ms-2). Icon is
  // start-aligned so the glyph lines up with the rail panel edge, not
  // optically shifted by a centered hit box.
  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute start-2 bottom-6 z-20"
      style={{ transform: `translateY(${offsetY}px)` }}
    >
      <button
        aria-label={label}
        className="pointer-events-auto flex size-9 cursor-default items-center justify-start text-chat-fg-muted transition-colors hover:text-chat-fg"
        onMouseDown={(event) => startDrag(event.clientY)}
        onClick={() => handleClick(onJump)}
        type="button"
      >
        <Icon className="size-4" />
      </button>
    </div>
  );
}
