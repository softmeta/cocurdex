import type { NoteSummary } from "@cocurdex/shared";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  FilePlus,
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

type DropLine = { edge: "top" | "bottom"; depth: number };

function dropLineFor(
  drop: NoteMoveTarget,
  note: NoteSummary,
  depth: number,
): DropLine | null {
  if (drop.beforeId === note.id) {
    return { edge: "top", depth };
  }
  if (drop.afterId === note.id) {
    return { edge: "bottom", depth };
  }
  if (drop.parentId === note.id && drop.beforeId !== undefined) {
    return { edge: "bottom", depth: depth + 1 };
  }
  return null;
}

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
  drop: NoteMoveTarget | undefined;
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
  drop,
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
  const hasLeadingIcon = note.kind === "folder" || Boolean(note.icon);
  const dropLine = drop ? dropLineFor(drop, note, depth) : null;
  const isDropTarget = drop !== undefined && dropLine === null;

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
            !isRenaming && "cursor-default active:cursor-grabbing",
          )}
          style={{ paddingInlineStart: `${4 + depth * 12}px` }}
          data-testid="note-tree-item"
          data-note-id={note.id}
        >
          {dropLine ? (
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute end-1 h-0.5 rounded-full bg-primary",
                dropLine.edge === "top" && "top-0",
                dropLine.edge === "bottom" && "bottom-0",
              )}
              style={{ insetInlineStart: `${6 + dropLine.depth * 12}px` }}
            />
          ) : null}
          <span className="-me-1 flex w-3 shrink-0 justify-center">
            {hasChildren ? (
              <SidebarListRowDisclosure
                size="compact"
                aria-expanded={isExpanded}
                aria-label={
                  isExpanded
                    ? t("sidebar.collapsePage")
                    : t("sidebar.expandPage")
                }
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand(note.id);
                }}
              >
                {hasLeadingIcon ? (
                  <NoteRowIcon
                    note={note}
                    isExpanded={isExpanded}
                    className="group-hover/note:hidden group-has-focus-visible/note:hidden"
                  />
                ) : null}
                <ChevronRight
                  className={cn(
                    "size-3 transition-transform rtl:rotate-180",
                    hasLeadingIcon &&
                      "hidden group-hover/note:block group-has-focus-visible/note:block",
                    isExpanded && "rotate-90 rtl:rotate-90",
                  )}
                />
              </SidebarListRowDisclosure>
            ) : (
              <NoteRowIcon
                note={note}
                isExpanded={false}
                className="text-sidebar-fg-muted"
              />
            )}
          </span>
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
  return (
    <div className="ms-6 mt-6 flex h-7 w-fit max-w-56 items-center gap-1.5 rounded-control bg-popover px-2 opacity-90 shadow-menu ring-1 ring-menu-ring">
      {note.kind === "folder" ? (
        <Folder className="size-3.5 shrink-0 text-sidebar-fg-muted" />
      ) : null}
      <SidebarListRowLabel className="text-sidebar-fg">
        {note.title || t("sidebar.untitled")}
      </SidebarListRowLabel>
    </div>
  );
}

function NoteRowIcon({
  note,
  isExpanded,
  className,
}: {
  note: NoteSummary;
  isExpanded: boolean;
  className?: string;
}) {
  if (note.icon) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-3 shrink-0 items-center justify-center text-meta leading-none",
          className,
        )}
      >
        {note.icon}
      </span>
    );
  }
  if (note.kind !== "folder") {
    return <span aria-hidden className="size-3 shrink-0" />;
  }
  const Icon = isExpanded ? FolderOpen : Folder;
  return <Icon aria-hidden className={cn("size-3 shrink-0", className)} />;
}
