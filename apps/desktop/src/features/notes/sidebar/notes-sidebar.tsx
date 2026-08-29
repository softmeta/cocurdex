import type { NoteSummary } from "@cocurdex/shared";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useAtomValue, useSetAtom } from "jotai";
import { FolderPlus, NotebookPen, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { AppConfirmDialog, SidebarPanelToggle } from "@/components";
import { EmptyState, ScrollArea, Spinner, Text } from "@/components/ui";
import { cn } from "@/lib";
import {
  activeNoteIdAtom,
  createNoteAtom,
  deleteNoteAtom,
  moveNoteAtom,
  noteSummariesAtom,
  notesLoadingAtom,
  openNoteAtom,
  renameNoteAtom,
} from "../notes-store";
import {
  ancestorFolderIds,
  buildVisibleNoteTree,
  canMoveNoteTo,
  listMoveDestinations,
  NOTES_ROOT_DROP_ID,
  resolveDropParentId,
} from "./build-note-tree";
import { NoteTreeDragPreview, NoteTreeItem } from "./note-tree-item";

export function NotesSidebar({ onCollapse }: { onCollapse: () => void }) {
  const { t } = useTranslation("notes");
  const summaries = useAtomValue(noteSummariesAtom);
  const loading = useAtomValue(notesLoadingAtom);
  const activeNoteId = useAtomValue(activeNoteIdAtom);
  const openNote = useSetAtom(openNoteAtom);
  const createNote = useSetAtom(createNoteAtom);
  const moveNote = useSetAtom(moveNoteAtom);
  const renameNote = useSetAtom(renameNoteAtom);
  const deleteNote = useSetAtom(deleteNoteAtom);
  // Note awaiting delete confirmation; deletion is recursive and permanent.
  const [pendingDelete, setPendingDelete] = useState<NoteSummary | null>(null);
  // User-collapsed folder ids. Active note ancestors are force-expanded.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Sidebar inline rename target (one row at a time).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // 8px so plain clicks still open / rename without starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const forcedExpandedIds = useMemo(() => {
    if (!activeNoteId) {
      return new Set<string>();
    }
    return new Set(ancestorFolderIds(activeNoteId, summaries));
  }, [activeNoteId, summaries]);

  const effectiveCollapsedIds = useMemo(() => {
    if (forcedExpandedIds.size === 0) {
      return collapsedIds;
    }
    const next = new Set(collapsedIds);
    for (const id of forcedExpandedIds) {
      next.delete(id);
    }
    return next;
  }, [collapsedIds, forcedExpandedIds]);

  const nodes = useMemo(
    () => buildVisibleNoteTree(summaries, effectiveCollapsedIds),
    [summaries, effectiveCollapsedIds],
  );

  const rootMoveLabel = t("sidebar.moveToRoot");
  const activeDragNote = useMemo(
    () =>
      activeDragId
        ? (summaries.find((note) => note.id === activeDragId) ?? null)
        : null,
    [activeDragId, summaries],
  );

  const dropParentForOver = useMemo(() => {
    if (!activeDragId || !overId) {
      return undefined;
    }
    return resolveDropParentId(summaries, activeDragId, overId);
  }, [activeDragId, overId, summaries]);

  const showRootDrop =
    activeDragId !== null && canMoveNoteTo(summaries, activeDragId, null);

  const toggleExpand = (folderId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const expandFolder = useCallback((folderId: string) => {
    setCollapsedIds((prev) => {
      if (!prev.has(folderId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
  }, []);

  const handleCreateChild = (parentId: string, kind: "note" | "folder") => {
    expandFolder(parentId);
    void createNote({
      parentId,
      kind,
      title: kind === "folder" ? t("sidebar.newFolderDefaultTitle") : undefined,
    }).then((created) => {
      if (created?.kind === "folder") {
        setRenamingId(created.id);
      }
    });
  };

  const handleCreateRootFolder = () => {
    void createNote({
      kind: "folder",
      title: t("sidebar.newFolderDefaultTitle"),
    }).then((created) => {
      if (created) {
        setRenamingId(created.id);
      }
    });
  };

  const handleCommitRename = async (id: string, title: string) => {
    const current = summaries.find((note) => note.id === id);
    const fallback = current?.title || t("sidebar.untitled");
    const next = title.trim() || fallback;
    try {
      if (next !== fallback) {
        await renameNote({ id, title: next });
      }
    } finally {
      setRenamingId(null);
    }
  };

  const clearDragState = () => {
    setActiveDragId(null);
    setOverId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setRenamingId(null);
    setActiveDragId(String(event.active.id));
    setOverId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const nextOver = event.over ? String(event.over.id) : null;
    setOverId(nextOver);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const fromId = String(event.active.id);
    const targetOverId = event.over ? String(event.over.id) : null;
    const parentId = resolveDropParentId(summaries, fromId, targetOverId);
    clearDragState();

    if (parentId === undefined) {
      return;
    }

    if (parentId !== null) {
      expandFolder(parentId);
    }
    void moveNote({ id: fromId, parentId });
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-2 p-2">
      <div className="flex h-6 items-center justify-between gap-1 pe-1">
        {/* ps-1 + size-3.5 toggle matches depth-0 note row icon column. */}
        <div className="flex min-w-0 items-center gap-1.5 ps-1">
          <SidebarPanelToggle
            onClick={onCollapse}
            aria-label={t("sidebar.collapse")}
          />
          <Text
            size="meta"
            weight="medium"
            className="leading-none text-editor-fg-subtle"
          >
            {t("sidebar.title")}
          </Text>
        </div>
        <div className="flex items-center gap-0.5">
          <TitlebarIconButton
            aria-label={t("sidebar.newFolder")}
            onClick={handleCreateRootFolder}
          >
            <FolderPlus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
          <TitlebarIconButton
            aria-label={t("sidebar.newNote")}
            onClick={() => {
              void createNote(null);
            }}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        </div>
      </div>

      {loading && summaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title={t("sidebar.empty.title")}
          description={t("sidebar.empty.description")}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDragState}
        >
          <ScrollArea className="min-h-0 min-w-0 w-full flex-1">
            <div className="flex w-full min-w-0 flex-col gap-0.5">
              {nodes.map(({ note, depth, hasChildren }) => {
                const isExpanded =
                  note.kind === "folder" && !effectiveCollapsedIds.has(note.id);
                const isDropTarget =
                  overId === note.id &&
                  dropParentForOver !== undefined &&
                  activeDragId !== note.id;
                return (
                  <NoteTreeItem
                    key={note.id}
                    note={note}
                    depth={depth}
                    isActive={note.id === activeNoteId}
                    isExpanded={isExpanded}
                    hasChildren={hasChildren}
                    isRenaming={note.id === renamingId}
                    isDropTarget={isDropTarget}
                    moveDestinations={listMoveDestinations(
                      summaries,
                      note.id,
                      rootMoveLabel,
                    )}
                    onOpen={(id) => {
                      if (renamingId || activeDragId) {
                        return;
                      }
                      void openNote(id);
                    }}
                    onToggleExpand={toggleExpand}
                    onStartRename={setRenamingId}
                    onCancelRename={() => setRenamingId(null)}
                    onCommitRename={handleCommitRename}
                    onCreateChild={handleCreateChild}
                    onMove={(id, parentId) => {
                      void moveNote({ id, parentId });
                    }}
                    onDelete={() => setPendingDelete(note)}
                  />
                );
              })}
              {showRootDrop ? (
                <RootDropZone
                  isActive={
                    overId === NOTES_ROOT_DROP_ID && dropParentForOver === null
                  }
                  label={t("sidebar.dropToRoot")}
                />
              ) : null}
            </div>
          </ScrollArea>
          <DragOverlay dropAnimation={null}>
            {activeDragNote ? (
              <NoteTreeDragPreview note={activeDragNote} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <AppConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={t("sidebar.deleteConfirm.title", {
          title: pendingDelete?.title || t("sidebar.untitled"),
        })}
        description={
          pendingDelete?.kind === "folder"
            ? t("sidebar.deleteConfirm.descriptionFolder")
            : t("sidebar.deleteConfirm.descriptionNote")
        }
        cancelLabel={t("sidebar.deleteConfirm.cancel")}
        confirmLabel={t("sidebar.deleteConfirm.confirm")}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (pendingDelete) {
            void deleteNote(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function RootDropZone({
  isActive,
  label,
}: {
  isActive: boolean;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: NOTES_ROOT_DROP_ID,
  });
  const highlighted = isActive || isOver;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mt-1 flex h-8 items-center justify-center rounded-control border border-dashed border-border px-2",
        "text-meta text-muted-foreground",
        highlighted && "border-ring bg-accent/40 text-foreground",
      )}
    >
      {label}
    </div>
  );
}
