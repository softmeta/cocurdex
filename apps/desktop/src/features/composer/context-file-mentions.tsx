import type { Ref } from "react";
import { CommandItem } from "@/components/ui";
import type { WorkspaceFileEntry } from "@/lib";
import { cn } from "@/lib";
import type { MentionAnchor } from "./mention-editor";
import { MentionFileRow } from "./mention-file-row";
import { MentionMenuList, MentionMenuPopover } from "./mention-menu-popover";
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
}

export function ContextFileMentionMenu({
  anchor,
  files,
  highlightedIndex,
  isOpen,
  menuRef,
  onSelect,
  placement = "top",
}: ContextFileMentionMenuProps) {
  const { highlightedItem, setListNode } = useHighlightedMenuRow({
    highlightedIndex,
    isOpen,
    items: files,
    itemAttribute: "data-mention-index",
  });

  if (!isOpen || !anchor) {
    return null;
  }

  const highlightedFile = files[highlightedIndex];

  return (
    <>
      <MentionMenuPopover anchor={anchor} isOpen={isOpen} side={placement}>
        <MentionMenuList commandRef={menuRef} listRef={setListNode}>
          {files.map((file, index) => {
            const isSelected = index === highlightedIndex;

            return (
              <CommandItem
                className={cn(
                  "min-w-0",
                  isSelected && "bg-accent text-accent-foreground",
                )}
                data-mention-index={index}
                key={file.path}
                onMouseDown={(event) => event.preventDefault()}
                onSelect={() => onSelect(file)}
                value={file.path}
              >
                <MentionFileRow file={file} />
              </CommandItem>
            );
          })}
        </MentionMenuList>
      </MentionMenuPopover>
      {highlightedFile ? (
        <MenuRowSidecar reference={highlightedItem}>
          <MentionPreview file={highlightedFile} />
        </MenuRowSidecar>
      ) : null}
    </>
  );
}
