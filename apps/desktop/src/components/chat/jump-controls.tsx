import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/ui/icon-button";

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
      <IconButton
        aria-label={label}
        className="group/jump pointer-events-auto relative cursor-default rounded-full bg-popover text-popover-foreground ring-1 ring-foreground/10 hover:bg-accent"
        onClick={onJump}
        size="sm"
      >
        {streaming && showJumpToLatest ? (
          <>
            <StreamingDots />
            <Icon className="hidden size-3.5 group-hover/jump:block group-focus-visible/jump:block" />
          </>
        ) : (
          <Icon className="size-3.5" />
        )}
      </IconButton>
    </div>
  );
}

function StreamingDots() {
  return (
    <svg
      aria-hidden="true"
      className="stream-dots size-4 group-hover/jump:hidden group-focus-visible/jump:hidden"
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
