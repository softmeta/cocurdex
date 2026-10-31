import type { AgentSlashCommand } from "@cocurdex/shared";
import type { Ref } from "react";
import { CommandItem, Text } from "@/components/ui";
import { cn } from "@/lib";
import type { MentionAnchor } from "./mention-editor";
import { MentionMenuList, MentionMenuPopover } from "./mention-menu-popover";
import { MenuRowSidecar } from "./menu-row-sidecar";
import { SlashCommandPreview } from "./slash-command-preview";
import { useHighlightedMenuRow } from "./use-highlighted-menu-row";

interface SlashCommandMenuProps {
  anchor?: MentionAnchor | null;
  commands: AgentSlashCommand[];
  highlightedIndex: number;
  isOpen: boolean;
  menuRef?: Ref<HTMLDivElement>;
  onHighlightIndex(index: number): void;
  onSelect(command: AgentSlashCommand): void;
  placement?: "top" | "bottom";
}

export function SlashCommandMenu({
  anchor,
  commands,
  highlightedIndex,
  isOpen,
  menuRef,
  onHighlightIndex,
  onSelect,
  placement = "top",
}: SlashCommandMenuProps) {
  const { highlightedItem, setListNode } = useHighlightedMenuRow({
    highlightedIndex,
    isOpen,
    items: commands,
    itemAttribute: "data-slash-index",
  });

  if (!isOpen || !anchor) {
    return null;
  }

  const highlightedCommand = commands[highlightedIndex];
  const previewDescription = highlightedCommand?.description?.trim();

  return (
    <>
      <MentionMenuPopover
        anchor={anchor}
        containerRef={menuRef}
        isOpen={isOpen}
        side={placement}
      >
        <MentionMenuList listRef={setListNode}>
          {commands.map((command, index) => {
            const isSelected = index === highlightedIndex;
            return (
              <CommandItem
                className={cn(
                  "min-w-0",
                  isSelected && "bg-accent text-accent-foreground",
                )}
                data-slash-index={index}
                key={command.name}
                onMouseDown={(event) => event.preventDefault()}
                onPointerEnter={() => onHighlightIndex(index)}
                onSelect={() => onSelect(command)}
                value={command.name}
              >
                <Text className="min-w-0 flex-1" truncate>
                  {command.name}
                </Text>
              </CommandItem>
            );
          })}
        </MentionMenuList>
      </MentionMenuPopover>
      {previewDescription ? (
        <MenuRowSidecar reference={highlightedItem}>
          <SlashCommandPreview description={previewDescription} />
        </MenuRowSidecar>
      ) : null}
    </>
  );
}
