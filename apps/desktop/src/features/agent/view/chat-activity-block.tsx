import { ChevronDown } from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui";
import { cn } from "@/lib";

export function ActivityBlock({
  busy = false,
  children,
  reasoningCount,
  toolCount,
}: {
  busy?: boolean;
  children: ReactNode;
  reasoningCount: number;
  toolCount: number;
}) {
  const { t } = useTranslation("agent");
  const [open, setOpen] = useState(false);
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

  const counts = [
    toolCount > 0 ? t("activity.toolCount", { count: toolCount }) : null,
    reasoningCount > 0
      ? t("activity.reasoningCount", { count: reasoningCount })
      : null,
  ].filter(Boolean);

  return (
    <Collapsible
      className="group/activity w-full min-w-0 max-w-3xl"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger className="mb-1 flex w-full cursor-pointer items-center gap-2 py-0.5 text-sm transition-colors hover:text-chat-fg">
        <span
          className={cn(
            "shrink-0 text-xs font-medium text-chat-fg-muted",
            busy && "activity-shimmer",
          )}
        >
          {t("activity.title")}
        </span>
        {counts.length > 0 ? (
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium text-chat-fg",
              busy && "activity-shimmer",
            )}
          >
            {counts.join(" · ")}
          </span>
        ) : null}
        {/* The panel grows downward: chevron down means "opens", up means
            "closes". Vertical-only rotation keeps it direction-neutral in RTL,
            matching the plan panel's collapse affordance. */}
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-chat-fg-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "flex flex-col gap-1 ps-0.5",
          // Opacity + slide only (no height): height would force measuring
          // contents on open, conflicting with the deferred mounting that keeps
          // expansion cheap. Pairs with Base UI's data-starting/ending-style.
          "transition-[opacity,transform] duration-150 ease-out data-starting-style:-translate-y-1 data-starting-style:opacity-0 data-ending-style:duration-100 data-ending-style:opacity-0",
        )}
        keepMounted={keepMounted}
      >
        {keepMounted || showRows ? children : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
