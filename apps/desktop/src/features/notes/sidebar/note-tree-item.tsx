import type { NoteSummary } from "@cocurdex/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { type MutableRefObject, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  IconButton,
  SidebarListRow,
  SidebarListRowActions,
  SidebarListRowLabel,
} from "@/components/ui";
import { cn } from "@/lib";
import { useScrollIntoViewWhenActive } from "@/lib/react-hooks";
import type { MoveDestination } from "./build-note-tree";

export type NoteTreeDragData = {
  type: "note-item";
  note: NoteSummary;
};

interface NoteTreeItemProps {
  note: NoteSummary;
  depth: number;
  isActive: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  isRenaming: boolean;
  /** True while this row is a valid drop target under the active drag. */
  isDropTarget: boolean;
  moveDestinations: MoveDestination[];
  onOpen: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onCommitRename: (id: string, title: string) => Promise<void>;
  onCreateChild: (parentId: string, kind: "note" | "folder") => void;
  onMove: (id: string, parentId: string | null) => void;
  onDelete: (id: string) => void;
}

export function NoteTreeItem({
  note,
  depth,
  isActive,
  isExpanded,
  hasChildren,
  isRenaming,
  isDropTarget,
  moveDestinations,
  onOpen,
  onToggleExpand,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onCreateChild,
  onMove,
  onDelete,
}: NoteTreeItemProps) {
  const { t } = useTranslation("notes");
  const scrollRef = useScrollIntoViewWhenActive<HTMLDivElement>(isActive);
  const isFolder = note.kind === "folder";
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const Icon = isFolder ? FolderIcon : FileText;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: note.id,
    data: { type: "note-item", note } satisfies NoteTreeDragData,
    disabled: isRenaming,
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: note.id,
    data: { type: "note-item", note } satisfies NoteTreeDragData,
    disabled: isRenaming,
  });

  const setRowRef = (node: HTMLDivElement | null) => {
    (scrollRef as MutableRefObject<HTMLDivElement | null>).current = node;
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <ContextMenu>
      {/* asChild: avoid a non-stretching Trigger wrapper so truncate tracks sidebar width. */}
      <ContextMenuTrigger asChild>
        <SidebarListRow
          ref={setRowRef}
          {...attributes}
          {...(isRenaming ? {} : listeners)}
          isActive={isActive}
          // Tighter start than default px-2 so the selected fill hugs the icon;
          // depth adds tree indent from that base. End pe-0.5 leaves room for delete.
          className={cn(
            "ps-1 pe-0.5",
            isDragging && "opacity-40",
            isDropTarget &&
              "bg-accent/40 ring-1 ring-ring ring-inset hover:bg-accent/40 data-active:hover:bg-accent/40",
            !isRenaming && "cursor-grab active:cursor-grabbing",
          )}
          style={
            depth > 0
              ? { paddingInlineStart: `${4 + depth * 12}px` }
              : undefined
          }
          data-testid="note-tree-item"
          data-note-id={note.id}
        >
          {isFolder && hasChildren ? (
            <button
              type="button"
              className="flex size-3.5 shrink-0 items-center justify-center text-sidebar-fg-muted hover:text-sidebar-fg"
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? t("sidebar.collapseFolder")
                  : t("sidebar.expandFolder")
              }
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand(note.id);
              }}
            >
              <Icon className="size-3.5" />
            </button>
          ) : (
            <Icon
              className="size-3.5 shrink-0 text-sidebar-fg-muted"
              aria-hidden
            />
          )}
          {isRenaming ? (
            <InlineRenameInput
              initialTitle={note.title}
              untitledLabel={t("sidebar.untitled")}
              ariaLabel={t("sidebar.rename")}
              onCancel={onCancelRename}
              onCommit={(title) => onCommitRename(note.id, title)}
            />
          ) : (
            <button
              type="button"
              className="flex h-6 min-w-0 flex-1 items-center overflow-hidden text-start"
              onClick={() => onOpen(note.id)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onStartRename(note.id);
              }}
            >
              <SidebarListRowLabel>
                {note.title || t("sidebar.untitled")}
              </SidebarListRowLabel>
            </button>
          )}
          {!isRenaming ? (
            <SidebarListRowActions visibility="hover">
              <IconButton
                size="xs"
                variant="ghost"
                className="text-sidebar-fg-muted hover:bg-transparent hover:text-sidebar-fg"
                aria-label={t("sidebar.delete")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={() => onDelete(note.id)}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </SidebarListRowActions>
          ) : null}
        </SidebarListRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {isFolder ? (
          <>
            <ContextMenuItem onClick={() => onCreateChild(note.id, "note")}>
              <FilePlus className="size-3.5" />
              {t("sidebar.newNoteInside")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onCreateChild(note.id, "folder")}>
              <FolderPlus className="size-3.5" />
              {t("sidebar.newFolderInside")}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onClick={() => onStartRename(note.id)}>
          <Pencil className="size-3.5" />
          {t("sidebar.rename")}
        </ContextMenuItem>
        {moveDestinations.length > 0 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput className="size-3.5" />
              {t("sidebar.moveTo")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-40">
              {moveDestinations.map((dest) => (
                <ContextMenuItem
                  key={dest.parentId ?? "__root__"}
                  onClick={() => onMove(note.id, dest.parentId)}
                >
                  <span className="min-w-0 flex-1 truncate">{dest.title}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(note.id)}
        >
          <Trash2 className="size-3.5" />
          {t("sidebar.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Lightweight row used inside DragOverlay (no dnd hooks). */
export function NoteTreeDragPreview({ note }: { note: NoteSummary }) {
  const { t } = useTranslation("notes");
  const Icon = note.kind === "folder" ? Folder : FileText;
  return (
    <div className="flex h-7 max-w-56 items-center gap-1.5 rounded-control border border-border bg-popover px-2 shadow-md">
      <Icon className="size-3.5 shrink-0 text-sidebar-fg-muted" />
      <SidebarListRowLabel className="text-sidebar-fg">
        {note.title || t("sidebar.untitled")}
      </SidebarListRowLabel>
    </div>
  );
}

function InlineRenameInput({
  initialTitle,
  untitledLabel,
  ariaLabel,
  onCancel,
  onCommit,
}: {
  initialTitle: string;
  untitledLabel: string;
  ariaLabel: string;
  onCancel: () => void;
  onCommit: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialTitle || untitledLabel);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipCommitRef = useRef(false);
  const committingRef = useRef(false);
  const didFocusRef = useRef(false);
  // Keep the callback identity stable. An inline callback ref is recreated on
  // every keystroke re-render; React then re-attaches it and re-runs select(),
  // which wipes the caret and makes continuous typing impossible.
  const setInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (!node || didFocusRef.current) {
      return;
    }
    didFocusRef.current = true;
    node.focus();
    node.select();
  }, []);

  const commit = async () => {
    if (skipCommitRef.current || committingRef.current) {
      skipCommitRef.current = false;
      return;
    }
    committingRef.current = true;
    try {
      await onCommit(value);
    } finally {
      committingRef.current = false;
    }
  };

  return (
    <input
      ref={setInputRef}
      type="text"
      value={value}
      aria-label={ariaLabel}
      className={cn(
        "h-6 min-w-0 flex-1 rounded-control border border-ring bg-background px-1 text-body leading-6 text-sidebar-fg",
        "outline-none",
      )}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          inputRef.current?.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          skipCommitRef.current = true;
          onCancel();
        }
      }}
    />
  );
}
