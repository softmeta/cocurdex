import { Popover } from "@base-ui/react/popover";
import { type ReactNode, type Ref, useMemo } from "react";
import type { MentionAnchor } from "./mention-editor-dom";

// Gap between the caret glyph and the menu edge.
const MENU_SIDE_OFFSET = 8;
// Breathing room so the menu never sits flush against the window edge.
const MENU_COLLISION_PADDING = 8;

interface MentionMenuPopoverProps {
  anchor: MentionAnchor;
  children: ReactNode;
  /** Popup element — carries the menu's `--available-*` sizing context. */
  containerRef?: Ref<HTMLDivElement>;
  isOpen: boolean;
  side: "bottom" | "top";
}

// Caret-anchored menus (@ mentions, / commands) position against a zero-width
// virtual anchor sitting on the trigger glyph, so the menu hugs the caret's
// line rather than the composer box. Base UI's Positioner owns collision
// handling and publishes `--available-width` / `--available-height`, which the
// menus size against: the chat surface is meant to also run as its own narrow
// renderer window, where a DOM popup can never escape the window bounds and
// must shrink instead of overflowing.
export function MentionMenuPopover({
  anchor,
  children,
  containerRef,
  isOpen,
  side,
}: MentionMenuPopoverProps) {
  const virtualAnchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        new DOMRect(anchor.left, anchor.top, 0, anchor.bottom - anchor.top),
    }),
    [anchor.bottom, anchor.left, anchor.top],
  );

  return (
    <Popover.Root modal={false} open={isOpen}>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          anchor={virtualAnchor}
          className="z-50"
          collisionPadding={MENU_COLLISION_PADDING}
          side={side}
          sideOffset={MENU_SIDE_OFFSET}
        >
          {/* Focus stays in the composer editor, which owns all menu keyboard
              handling; moving it into the popup would break typing. */}
          <Popover.Popup
            className="relative w-[360px] max-w-[var(--available-width)] outline-none"
            finalFocus={false}
            initialFocus={false}
            ref={containerRef}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
