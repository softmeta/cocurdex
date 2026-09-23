import type { Ref } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui";
import type { WorkspaceFileEntry } from "@/lib";
import { cn } from "@/lib";
import type { MentionAnchor } from "./mention-editor";
import { MentionFileRow } from "./mention-file-row";
import { MentionMenuPopover } from "./mention-menu-popover";
import { MentionPreview } from "./mention-preview";
import { MenuRowSidecar } from "./menu-row-sidecar";
import { useHighlightedMenuRow } from "./use-highlighted-menu-row";

interface ContextFileMentionMenuProps {
  // Position of the active `@` glyph relative to the editor. When present the
  // menu anchors to the caret's line; otherwise it falls back to the editor's
  // leading edge.
  anchor?: MentionAnchor | null;
  files: WorkspaceFileEntry[];
  highlightedIndex: number;
  isOpen: boolean;
  menuRef?: Ref<HTMLDivElement>;
  onSelect(file: WorkspaceFileEntry): void;
  placement?: "top" | "bottom";
  tone?: "chat" | "welcome";
}

export function ContextFileMentionMenu({
  anchor,
  files,
  highlightedIndex,
  isOpen,
  menuRef,
  onSelect,
  placement = "top",
  tone = "chat",
}: ContextFileMentionMenuProps) {
  const { highlightedItem, setListNode } = useHighlightedMenuRow({
    highlightedIndex,
    isOpen,
    items: files,
    itemAttribute: "data-mention-index",
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
  const pathClassName =
    tone === "welcome" ? "text-welcome-fg-muted" : "text-chat-fg-muted";

  if (!isOpen || !anchor) {
    return null;
  }

  const highlightedFile = files[highlightedIndex];

  return (
    <>
      <MentionMenuPopover anchor={anchor} isOpen={isOpen} side={placement}>
        <Command
          ref={menuRef}
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
              {files.map((file, index) => {
                const isSelected = index === highlightedIndex;

                return (
                  <CommandItem
                    className={cn(
                      "h-8 min-w-0 items-center gap-2 rounded-control px-2 text-current",
                      isSelected ? selectedClassName : hoverClassName,
                    )}
                    data-mention-index={index}
                    key={file.path}
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => onSelect(file)}
                    value={file.path}
                  >
                    <MentionFileRow file={file} pathClassName={pathClassName} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </MentionMenuPopover>
      {highlightedFile ? (
        <MenuRowSidecar reference={highlightedItem}>
          <MentionPreview file={highlightedFile} tone={tone} />
        </MenuRowSidecar>
      ) : null}
    </>
  );
}
