import type { AgentSlashCommand } from "@cocurdex/shared";
import type { Ref } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import type { MentionAnchor } from "./mention-editor";
import { MentionMenuPopover } from "./mention-menu-popover";
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
  tone?: "chat" | "welcome";
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
  tone = "chat",
}: SlashCommandMenuProps) {
  const { highlightedItem, setListNode } = useHighlightedMenuRow({
    highlightedIndex,
    isOpen,
    items: commands,
    itemAttribute: "data-slash-index",
  });

  const menuClassName =
    tone === "welcome"
      ? "border-welcome-border/60 bg-welcome-surface/95 text-welcome-fg-secondary backdrop-blur-md"
      : "border-chat-border-soft bg-chat-surface-raised/95 text-chat-fg backdrop-blur-md";
  const hoverClassName =
    tone === "welcome"
      ? "data-highlighted:bg-welcome-surface-row-hover data-highlighted:text-welcome-fg"
      : "data-highlighted:bg-chat-surface-row-hover data-highlighted:text-chat-fg";
  const selectedClassName =
    tone === "welcome"
      ? "bg-welcome-surface-selected! text-welcome-fg!"
      : "bg-chat-surface-selected! text-chat-fg!";
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
        <Command
          className={cn(
            "h-auto max-h-[var(--available-height)] rounded-card border p-1.5 shadow-chat-soft",
            menuClassName,
          )}
          autoHighlight={false}
          shouldFilter={false}
        >
          <CommandList
            className="max-h-[min(18rem,var(--available-height))]"
            ref={setListNode}
          >
            <CommandGroup className="p-0">
              {commands.map((command, index) => {
                const isSelected = index === highlightedIndex;
                return (
                  <CommandItem
                    className={cn(
                      "h-8 min-w-0 items-center rounded-control px-2 text-current",
                      isSelected ? selectedClassName : hoverClassName,
                    )}
                    data-slash-index={index}
                    key={command.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerEnter={() => onHighlightIndex(index)}
                    onSelect={() => onSelect(command)}
                    value={command.name}
                  >
                    <Text
                      className="min-w-0 flex-1"
                      size="body"
                      truncate
                      weight="medium"
                    >
                      {command.name}
                    </Text>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </MentionMenuPopover>
      {previewDescription ? (
        <MenuRowSidecar reference={highlightedItem}>
          <SlashCommandPreview description={previewDescription} tone={tone} />
        </MenuRowSidecar>
      ) : null}
    </>
  );
}
