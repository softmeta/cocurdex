import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

const VIEWPORT_PADDING = 8;
const SIDECAR_GAP = 8;

interface MenuRowSidecarProps {
  children: ReactNode;
  reference: HTMLElement | null;
}

export function isMenuRowSidecarEventTarget(target: EventTarget | null) {
  let element: Element | null = null;
  if (target instanceof Element) {
    element = target;
  } else if (target instanceof Node) {
    element = target.parentElement;
  }
  return Boolean(element?.closest("[data-menu-row-sidecar]"));
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
          anchor={reference}
          className="z-50 hidden md:block"
          collisionPadding={VIEWPORT_PADDING}
          side="inline-end"
          sideOffset={SIDECAR_GAP}
        >
          <Popover.Popup
            className="max-h-[min(18rem,var(--available-height))] max-w-[min(18rem,var(--available-width))] overflow-y-auto outline-none"
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
