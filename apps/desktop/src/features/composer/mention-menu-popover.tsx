import { Popover } from "@base-ui/react/popover";
import { type ReactNode, type Ref, useMemo } from "react";
import { Command, CommandGroup, CommandList } from "@/components/ui";
import type { MentionAnchor } from "./mention-editor-dom";

const MENU_SIDE_OFFSET = 8;
const MENU_COLLISION_PADDING = 8;

interface MentionMenuPopoverProps {
  anchor: MentionAnchor;
  children: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  isOpen: boolean;
  side: "bottom" | "top";
}

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

interface MentionMenuListProps {
  children: ReactNode;
  commandRef?: Ref<HTMLDivElement>;
  listRef?: Ref<HTMLDivElement>;
}

export function MentionMenuList({
  children,
  commandRef,
  listRef,
}: MentionMenuListProps) {
  return (
    <Command
      autoHighlight={false}
      className="h-auto max-h-(--available-height) rounded-card bg-popover p-1.5 text-popover-foreground shadow-menu ring-1 ring-menu-ring"
      ref={commandRef}
      shouldFilter={false}
    >
      <CommandList
        className="max-h-[min(18rem,var(--available-height))]"
        ref={listRef}
      >
        <CommandGroup className="p-0">{children}</CommandGroup>
      </CommandList>
    </Command>
  );
}
