import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type * as React from "react";

import { asChildToRender } from "@/components/ui/_as-child-render";
import { cn } from "@/lib/utils";

function HoverCard({
  ...props
}: React.ComponentProps<typeof PreviewCardPrimitive.Root>) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

type HoverCardTriggerProps = React.ComponentProps<
  typeof PreviewCardPrimitive.Trigger
> & {
  asChild?: boolean;
};

function HoverCardTrigger({
  asChild,
  children,
  ...props
}: HoverCardTriggerProps) {
  return (
    <PreviewCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      // biome-ignore lint/suspicious/noExplicitAny: asChildToRender returns a generic prop bag; each Base UI Trigger has its own state-typed render fn that we don't enumerate here.
      {...(asChildToRender({ asChild, children, ...props }) as any)}
    />
  );
}

type HoverCardContentProps = React.ComponentProps<
  typeof PreviewCardPrimitive.Popup
> & {
  align?: React.ComponentProps<typeof PreviewCardPrimitive.Positioner>["align"];
  side?: React.ComponentProps<typeof PreviewCardPrimitive.Positioner>["side"];
  sideOffset?: React.ComponentProps<
    typeof PreviewCardPrimitive.Positioner
  >["sideOffset"];
  alignOffset?: React.ComponentProps<
    typeof PreviewCardPrimitive.Positioner
  >["alignOffset"];
};

function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}: HoverCardContentProps) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal">
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[60]"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "z-50 w-64 origin-(--transform-origin) rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
