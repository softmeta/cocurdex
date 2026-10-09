import { ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import { useTranscriptState } from "../use-transcript-state";

export function ActivityBlock({
  busy = false,
  children,
  label,
  stateKey,
  variant,
}: {
  busy?: boolean;
  children: ReactNode;
  label: string;
  stateKey: string;
  variant: "step" | "turn";
}) {
  const [open, setOpen] = useTranscriptState(stateKey, false);
  // Defer mounting the expanded rows. The click commits the chevron rotation
  // and panel reveal on a fast frame; React then mounts the (often heavy) tool
  // / reasoning subtree as a low-priority update. Mounting that whole subtree
  // synchronously in the click frame is what made the chevron transition
  // stutter on expand.
  const showRows = useDeferredValue(open);
  // Latch `keepMounted` after the first open so collapsing hides the panel
  // instead of unmounting it. Without this, Base UI's default `keepMounted={false}`
  // tears down the whole subtree on close, re-paying the full mount cost on every
  // expand — the jank the user sees on repeat toggles of heavy panels. First
  // open still mounts once (deferred); every later expand is a no-op render.
  // Adjusted during render (React's documented pattern) instead of an effect,
  // so the latch lands in the same commit that flips `showRows`.
  const [keepMounted, setKeepMounted] = useState(false);
  if (showRows && !keepMounted) {
    setKeepMounted(true);
  }

  const trigger =
    variant === "turn" ? (
      <TurnTrigger busy={busy} label={label} open={open} />
    ) : (
      <StepTrigger busy={busy} label={label} open={open} />
    );

  return (
    <Collapsible
      className={cn(
        "group/activity min-w-0 max-w-3xl",
        variant === "turn" && "w-full",
        variant === "step" && "-mx-1.5",
      )}
      onOpenChange={setOpen}
      open={open}
    >
      {trigger}
      <CollapsibleContent
        className={cn(
          "flex flex-col gap-1 overflow-hidden",
          variant === "turn" && "mt-1 mb-3",
          variant === "step" &&
            "ms-3 mt-0.5 mb-1 border-s border-chat-border-soft ps-2.5",
          // Height/margin interpolate between 0 and `auto` (interpolate-size)
          // in both directions so surrounding content glides instead of
          // snapping. `auto` resolves at layout time, so rows mounted late by
          // the deferred reveal still grow smoothly.
          "transition-[opacity,transform,height,margin] duration-200 ease-[cubic-bezier(0.2,0,0,1)] [interpolate-size:allow-keywords] data-ending-style:duration-150 data-starting-style:mt-0 data-starting-style:mb-0 data-starting-style:h-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0 data-ending-style:mt-0 data-ending-style:mb-0 data-ending-style:h-0 data-ending-style:opacity-0",
        )}
        keepMounted={keepMounted}
      >
        {keepMounted || showRows ? children : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function TurnTrigger({
  busy,
  label,
  open,
}: {
  busy: boolean;
  label: string;
  open: boolean;
}) {
  return (
    <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 border-chat-border-soft mb-3 border-b pt-0.5 pb-2 text-body transition-colors hover:text-chat-fg-secondary">
      <span
        className={cn(
          "min-w-0 truncate font-medium text-chat-fg-muted",
          busy && "activity-shimmer",
        )}
      >
        {label}
      </span>
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-chat-fg-muted transition-transform",
          open && "rotate-180",
        )}
      />
    </CollapsibleTrigger>
  );
}

function StepTrigger({
  busy,
  label,
  open,
}: {
  busy: boolean;
  label: string;
  open: boolean;
}) {
  return (
    <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-control px-1.5 py-1 text-left text-body text-chat-fg-muted transition-colors hover:bg-chat-surface-row-hover">
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 transition-transform rtl:-scale-x-100",
          open && "rotate-90",
        )}
      />
      <span
        className={cn(
          "min-w-0 truncate text-chat-fg-secondary",
          busy && "activity-shimmer",
        )}
      >
        {label}
      </span>
    </CollapsibleTrigger>
  );
}
