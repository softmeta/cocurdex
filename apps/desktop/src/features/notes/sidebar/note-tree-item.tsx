import type { NoteSummary } from "@cocurdex/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { AppInlineRenameInput, AppSidebarRowTitle } from "@/components/app";
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
  SidebarListRowDisclosure,
  SidebarListRowLabel,
} from "@/components/ui";
import { cn } from "@/lib";
import { useScrollIntoViewWhenActive } from "@/lib/react-hooks";
import type { MoveDestination, NoteMoveTarget } from "./note-moves";

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
  isDropTarget: boolean;
  moveDestinations: MoveDestination[];
  onOpen: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onCommitRename: (id: string, title: string) => Promise<void>;
  onCreateChild: (parentId: string) => void;
  onMove: (id: string, target: NoteMoveTarget) => void;
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
    attributes: { role: "group" },
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
      <ContextMenuTrigger asChild>
        <SidebarListRow
          ref={setRowRef}
          {...attributes}
          {...(isRenaming ? {} : listeners)}
          isActive={isActive}
          className={cn(
            "group/note pe-0.5",
            isDragging && "opacity-40",
            isDropTarget &&
              "bg-accent/40 ring-1 ring-ring ring-inset hover:bg-accent/40 data-active:hover:bg-accent/40",
            !isRenaming && "cursor-grab active:cursor-grabbing",
          )}
          style={
            depth > 0
              ? { paddingInlineStart: `${8 + depth * 12}px` }
              : undefined
          }
          data-testid="note-tree-item"
          data-note-id={note.id}
        >
          {hasChildren ? (
            <SidebarListRowDisclosure
              aria-expanded={isExpanded}
              aria-label={
                isExpanded ? t("sidebar.collapsePage") : t("sidebar.expandPage")
              }
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand(note.id);
              }}
            >
              <Icon className="size-3.5 group-hover/note:hidden" />
              <ChevronRight
                className={cn(
                  "hidden size-3.5 transition-transform group-hover/note:block rtl:rotate-180",
                  isExpanded && "rotate-90 rtl:rotate-90",
                )}
              />
            </SidebarListRowDisclosure>
          ) : (
            <Icon
              className="size-3.5 shrink-0 text-sidebar-fg-muted"
              aria-hidden
            />
          )}
          {isRenaming ? (
            <AppInlineRenameInput
              initialTitle={note.title}
              untitledLabel={t("sidebar.untitled")}
              ariaLabel={t("sidebar.rename")}
              onCancel={onCancelRename}
              onCommit={(title) => onCommitRename(note.id, title)}
            />
          ) : (
            <AppSidebarRowTitle
              title={note.title || t("sidebar.untitled")}
              timestamp={note.kind === "folder" ? undefined : note.updatedAt}
              onOpen={() => onOpen(note.id)}
              onStartRename={() => onStartRename(note.id)}
            />
          )}
          {!isRenaming ? (
            <SidebarListRowActions visibility="hover-reveal">
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
              <IconButton
                size="xs"
                variant="ghost"
                className="text-sidebar-fg-muted hover:bg-transparent hover:text-sidebar-fg"
                aria-label={t("sidebar.newSubpage")}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={() => onCreateChild(note.id)}
              >
                <Plus className="size-3.5" />
              </IconButton>
            </SidebarListRowActions>
          ) : null}
        </SidebarListRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onClick={() => onCreateChild(note.id)}>
          <FilePlus className="size-3.5" />
          {t("sidebar.newSubpage")}
        </ContextMenuItem>
        <ContextMenuSeparator />
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
            <ContextMenuSubContent>
              {moveDestinations.map((dest) => (
                <ContextMenuItem
                  key={
                    dest.target.parentId ??
                    `section:${dest.target.workspaceId ?? ""}`
                  }
                  onClick={() => onMove(note.id, dest.target)}
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
