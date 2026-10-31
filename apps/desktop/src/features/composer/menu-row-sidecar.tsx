import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";
import { FLYOUT_GAP, flyoutAnchor } from "@/components/ui";

const VIEWPORT_PADDING = 8;

interface MenuRowSidecarProps {
  children: ReactNode;
  reference: HTMLElement | null;
}

export function MenuRowSidecar({ children, reference }: MenuRowSidecarProps) {
  if (!reference) {
    return null;
  }

  return (
    <Popover.Root modal={false} open>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          anchor={flyoutAnchor(reference)}
          className="z-50 hidden data-anchor-hidden:invisible md:block"
          collisionPadding={VIEWPORT_PADDING}
          side="inline-end"
          sideOffset={FLYOUT_GAP}
        >
          <Popover.Popup
            className="max-h-[min(18rem,var(--available-height))] max-w-[min(18rem,var(--available-width))] overflow-y-auto rounded-control bg-popover p-1 text-popover-foreground shadow-lg ring-1 shadow-black/20 ring-foreground/10 outline-none"
            data-menu-row-sidecar=""
            finalFocus={false}
            initialFocus={false}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
