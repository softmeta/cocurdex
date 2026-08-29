import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type * as React from "react";

import { asChildToRender } from "@/components/ui/_as-child-render";
import { cn } from "@/lib/utils";

function TooltipProvider({
  delay = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & {
  /** Backwards-compatible alias for Base UI's `delay`. */
  delayDuration?: number;
}) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />;
}

type TooltipTriggerProps = React.ComponentProps<
  typeof TooltipPrimitive.Trigger
> & {
  asChild?: boolean;
};

function TooltipTrigger({ asChild, children, ...props }: TooltipTriggerProps) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      // biome-ignore lint/suspicious/noExplicitAny: asChildToRender returns a generic prop bag; each Base UI Trigger has its own state-typed render fn that we don't enumerate here.
      {...(asChildToRender({ asChild, children, ...props }) as any)}
    />
  );
}

type TooltipContentProps = React.ComponentProps<
  typeof TooltipPrimitive.Popup
> & {
  hideArrow?: boolean;
  side?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["side"];
  sideOffset?: React.ComponentProps<
    typeof TooltipPrimitive.Positioner
  >["sideOffset"];
  align?: React.ComponentProps<typeof TooltipPrimitive.Positioner>["align"];
  alignOffset?: React.ComponentProps<
    typeof TooltipPrimitive.Positioner
  >["alignOffset"];
  // Positioner-only collision props: Base UI exposes no other way to confine a
  // tooltip to a container (the popup is portaled), so they are forwarded here
  // rather than wrapped.
  collisionBoundary?: React.ComponentProps<
    typeof TooltipPrimitive.Positioner
  >["collisionBoundary"];
  collisionAvoidance?: React.ComponentProps<
    typeof TooltipPrimitive.Positioner
  >["collisionAvoidance"];
};

function TooltipContent({
  className,
  sideOffset = 0,
  side,
  align,
  alignOffset,
  children,
  collisionAvoidance,
  collisionBoundary,
  hideArrow = false,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        sideOffset={sideOffset}
        side={side}
        align={align}
        alignOffset={alignOffset}
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        // Tooltips must stay above popup layers (popover/combobox/select all
        // sit at z-50); same z-index would let portal DOM order win instead.
        className="z-[60]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "relative z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pe-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
          {!hideArrow && (
            // Base UI sets position:absolute + the main-axis offset (left/top)
            // on the arrow; we only position the cross-axis so it straddles the
            // popup edge facing the trigger. Requires the popup to be relative.
            <TooltipPrimitive.Arrow className="z-50 size-2.5 rotate-45 rounded-[2px] bg-foreground data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
