import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useTranslation } from "react-i18next";

export function JumpControls({
  streaming = false,
  showJumpToTop,
  showJumpToLatest,
  onJumpToTop,
  onJumpToLatest,
}: {
  streaming?: boolean;
  showJumpToTop: boolean;
  showJumpToLatest: boolean;
  onJumpToTop(): void;
  onJumpToLatest(): void;
}) {
  const { t } = useTranslation(["common", "agent"]);

  if (!showJumpToTop && !showJumpToLatest) {
    return null;
  }

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

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <button
        aria-label={label}
        className="group/jump pointer-events-auto relative flex size-9 cursor-default items-center justify-center rounded-full bg-chat-surface-control text-chat-fg transition-colors hover:bg-chat-surface-control-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={onJump}
        type="button"
      >
        {streaming && showJumpToLatest ? (
          <>
            <StreamingDots />
            <Icon className="hidden size-4 group-hover/jump:block group-focus-visible/jump:block" />
          </>
        ) : (
          <Icon className="size-4" />
        )}
      </button>
    </div>
  );
}

function StreamingDots() {
  return (
    <svg
      aria-hidden="true"
      className="stream-dots size-5 group-hover/jump:hidden group-focus-visible/jump:hidden"
      data-stream-indicator="true"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
    </svg>
  );
}
