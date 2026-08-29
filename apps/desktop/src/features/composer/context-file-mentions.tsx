import {
  type ContextFileAttachment,
  type ContextFolderAttachment,
  formatContextFileChipLabel,
  isContextFolderAttachment,
} from "@cocurdex/shared";
import type { KeyboardEvent, Ref, RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui";
import { buildContextFileAttachment } from "@/features/editor";
import {
  getEntryName,
  rankWorkspaceEntries,
  useWorkspaceFiles,
} from "@/features/workspaces";
import type { WorkspaceFileEntry } from "@/lib";
import { cn, useDocumentEvent } from "@/lib";
import type {
  MentionAnchor,
  MentionableAttachment,
  MentionEditorHandle,
} from "./mention-editor";
import { MentionFileRow } from "./mention-file-row";
import { MentionMenuPopover } from "./mention-menu-popover";
import { MentionPreview } from "./mention-preview";
import {
  isMenuRowSidecarEventTarget,
  MenuRowSidecar,
} from "./menu-row-sidecar";
import { useHighlightedMenuRow } from "./use-highlighted-menu-row";

const CONTEXT_FILE_RESULT_LIMIT = 20;

type ContextAttachment = ContextFileAttachment | ContextFolderAttachment;

interface UseContextFileMentionsOptions {
  attachments: MentionableAttachment[];
  editorRef: RefObject<MentionEditorHandle | null>;
  workspaceRootPath?: string | null;
}

function getContextAttachmentPath(attachment: ContextAttachment) {
  return isContextFolderAttachment(attachment)
    ? attachment.folderPath
    : attachment.filePath;
}

function getRelativePath(
  absolutePath: string,
  workspaceRootPath?: string | null,
) {
  if (workspaceRootPath && absolutePath.startsWith(`${workspaceRootPath}/`)) {
    return absolutePath.slice(workspaceRootPath.length + 1);
  }
  return absolutePath;
}

// Display label inside the inline pill: shows the entry's base name (file
// name or folder name). Matches the Cursor-style "@docs" / "@app.tsx" look.
export function getMentionDisplayLabel(file: WorkspaceFileEntry) {
  return getEntryName(file);
}

// The textual form that gets serialized into the outgoing message body, used
// when reading the editor back into a string at send time.
export function getMentionSerializedText(
  file: WorkspaceFileEntry,
  workspaceRootPath?: string | null,
) {
  const relative = workspaceRootPath
    ? getRelativePath(file.path, workspaceRootPath)
    : file.relativePath;
  return `@${relative}`;
}

export function useContextFileMentions({
  attachments,
  editorRef,
  workspaceRootPath,
}: UseContextFileMentionsOptions) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { files } = useWorkspaceFiles(workspaceRootPath);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [query, setQuery] = useState<string | null>(null);

  const attachedContextPaths = useMemo(
    () => new Set(attachments.map(getContextAttachmentPath)),
    [attachments],
  );

  const matchingFiles = useMemo(() => {
    if (query === null || !workspaceRootPath) {
      return [];
    }

    const trimmed = query.trim();
    const candidates = files.filter(
      (file) => !attachedContextPaths.has(file.path),
    );

    // Empty query: show the first N entries in workspace order so the menu
    // still opens immediately after typing `@`.
    if (trimmed.length === 0) {
      return candidates.slice(0, CONTEXT_FILE_RESULT_LIMIT);
    }

    return rankWorkspaceEntries(candidates, trimmed).slice(
      0,
      CONTEXT_FILE_RESULT_LIMIT,
    );
  }, [attachedContextPaths, files, query, workspaceRootPath]);

  const isOpen = query !== null && matchingFiles.length > 0;

  const handleMentionQueryChange = useCallback((nextQuery: string | null) => {
    setQuery(nextQuery);
    setHighlightedIndex(0);
  }, []);

  const clearMention = useCallback(() => {
    setQuery(null);
    setHighlightedIndex(0);
  }, []);

  // Close the menu when the user clicks outside both the editor container and
  // the menu itself. Mirrors the original behaviour with the textarea.
  const handlePointerDownOutside = useCallback(
    (event: PointerEvent) => {
      if (query === null) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (isMenuRowSidecarEventTarget(target)) return;
      // The editor itself triggers selectionchange / input updates, so leave
      // it alone here. The contenteditable click path keeps the menu in sync.
      const editorNode = document.querySelector(".mention-editor");
      if (editorNode?.contains(target)) return;
      clearMention();
    },
    [query, clearMention],
  );
  useDocumentEvent("pointerdown", handlePointerDownOutside);

  const selectFile = (file: WorkspaceFileEntry) => {
    const editor = editorRef.current;
    if (!editor) return;

    if (file.kind === "directory") {
      if (attachedContextPaths.has(file.path)) {
        clearMention();
        return;
      }

      const attachment: ContextFolderAttachment = {
        folderPath: file.path,
        kind: "context-folder",
      };

      editor.insertMention(
        attachment,
        getMentionDisplayLabel(file),
        getMentionSerializedText(file, workspaceRootPath),
      );
      clearMention();
      return;
    }

    if (attachedContextPaths.has(file.path)) {
      clearMention();
      return;
    }

    const attachment = buildContextFileAttachment(file.path);

    editor.insertMention(
      attachment,
      getMentionDisplayLabel(file),
      getMentionSerializedText(file, workspaceRootPath),
    );
    clearMention();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    const key = event.key.toLowerCase();
    const isNextShortcut =
      event.key === "ArrowDown" || (event.ctrlKey && key === "n");
    const isPreviousShortcut =
      event.key === "ArrowUp" || (event.ctrlKey && key === "p");

    if (isNextShortcut) {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, matchingFiles.length - 1),
      );
      return;
    }

    if (isPreviousShortcut) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      clearMention();
      return;
    }

    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      const safeIndex = Math.min(highlightedIndex, matchingFiles.length - 1);
      const target = matchingFiles[safeIndex];
      if (target) {
        selectFile(target);
      }
    }
  };

  return {
    handleKeyDown,
    handleMentionQueryChange,
    highlightedIndex,
    isOpen,
    matchingFiles,
    menuRef,
    selectFile,
  };
}

export type ContextFileMentionsState = ReturnType<
  typeof useContextFileMentions
>;

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

// Display label for an externally provided context attachment (a code
// selection from the editor or a whole file/folder added from the file tree)
// once it is folded into the editor as an inline mention pill. Selections keep
// their line range so a partial span reads as "ipc.ts L12-13"; whole files
// and folders fall back to their base name like a typed @-mention.
export function getContextAttachmentMentionLabel(
  attachment: ContextFileAttachment | ContextFolderAttachment,
) {
  if (isContextFolderAttachment(attachment)) {
    const folderName = attachment.folderPath.split("/").pop();
    return folderName || attachment.folderPath;
  }
  return formatContextFileChipLabel(attachment);
}

// Serialized form written into the outgoing message body for an externally
// provided context attachment, mirroring typed @-mentions (`@relative/path`).
export function getContextAttachmentSerializedText(
  attachment: ContextFileAttachment | ContextFolderAttachment,
  workspaceRootPath?: string | null,
) {
  const absolutePath = isContextFolderAttachment(attachment)
    ? attachment.folderPath
    : attachment.filePath;
  return `@${getRelativePath(absolutePath, workspaceRootPath)}`;
}
