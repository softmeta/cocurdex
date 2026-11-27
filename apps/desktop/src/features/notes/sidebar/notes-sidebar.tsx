import type { NoteSummary } from "@cocurdex/shared";
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useAtomValue, useSetAtom } from "jotai";
import { NotebookPen, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarPanelHeader } from "@/app/layout/sidebar-panel-header";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { EmptyState, ScrollArea } from "@/components/ui";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
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
import { buildVisibleNoteTree } from "./build-note-tree";
import { NoteDeleteDialog } from "./note-delete-dialog";
import {
  dropZoneAt,
  listMoveDestinations,
  type NoteDropZone,
  type NoteMoveTarget,
  resolveDropTarget,
  sectionDropId,
} from "./note-moves";
import { NoteSectionHeader } from "./note-section-header";
import { groupNoteSections, noteSectionId } from "./note-sections";
import { NoteTreeDragPreview, NoteTreeItem } from "./note-tree-item";
import { useNoteTreeExpansion } from "./use-note-tree-expansion";

const PERSONAL_SECTION_KEY = "__personal__";

const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  const collisions =
    underPointer.length > 0 ? underPointer : rectIntersection(args);
  const pointer = args.pointerCoordinates;
  return collisions.map((collision) => {
    const rect = args.droppableRects.get(collision.id);
    const zone: NoteDropZone =
      pointer && rect ? dropZoneAt(pointer.y, rect) : "inside";
    return { ...collision, data: { ...collision.data, zone } };
  });
};

function zoneOf(event: DragMoveEvent | DragEndEvent): NoteDropZone {
  const top = event.collisions?.find(
    (collision) => collision.id === event.over?.id,
  );
  const zone: unknown = top?.data?.zone;
  return zone === "before" || zone === "after" ? zone : "inside";
}

function sectionKey(workspaceId: string | null): string {
  return workspaceId ?? PERSONAL_SECTION_KEY;
}

export function NotesSidebar() {
  const { t } = useTranslation("notes");
  const summaries = useAtomValue(noteSummariesAtom);
  const loading = useAtomValue(notesLoadingAtom);
  const activeNoteId = useAtomValue(activeNoteIdAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const openNote = useSetAtom(openNoteAtom);
  const createNote = useSetAtom(createNoteAtom);
  const moveNote = useSetAtom(moveNoteAtom);
  const renameNote = useSetAtom(renameNoteAtom);
  const deleteNote = useSetAtom(deleteNoteAtom);
  const [pendingDelete, setPendingDelete] = useState<NoteSummary | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<NoteDropZone>("inside");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const activeNote = summaries.find((note) => note.id === activeNoteId);
  const activeSectionKey = activeNote
    ? sectionKey(noteSectionId(activeNote, summaries, workspaceIds))
    : null;

  const expansion = useNoteTreeExpansion({
    summaries,
    activeNoteId,
    activeSectionKey,
    isSectionCollapsedByDefault: (key) =>
      key !== PERSONAL_SECTION_KEY && key !== activeWorkspaceId,
  });

  const workspaceName = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name]),
  );
  const sectionTitle = (workspaceId: string | null) =>
    (workspaceId && workspaceName.get(workspaceId)) ||
    t("sidebar.sections.personal");
  const sections = groupNoteSections(summaries, workspaces, activeWorkspaceId);
  const moveSections = [
    ...workspaces.map((workspace) => ({
      workspaceId: workspace.id,
      title: workspace.name,
    })),
    { workspaceId: null, title: t("sidebar.sections.personal") },
  ];
  const preferredSection =
    activeWorkspaceId && workspaceIds.has(activeWorkspaceId)
      ? activeWorkspaceId
      : null;

  const dropTarget =
    activeDragId && overId
      ? resolveDropTarget(
          summaries,
          activeDragId,
          overId,
          overZone,
          expansion.collapsedNoteIds,
        )
      : undefined;
  const activeDragNote = activeDragId
    ? (summaries.find((note) => note.id === activeDragId) ?? null)
    : null;

  const applyMove = (id: string, target: NoteMoveTarget) => {
    if (target.parentId === null) {
      expansion.expandSection(sectionKey(target.workspaceId));
    } else {
      expansion.expandNote(target.parentId);
    }
    void moveNote({ id, ...target });
  };

  const handleCreateChild = (parentId: string) => {
    expansion.expandNote(parentId);
    void createNote({ parentId });
  };

  const handleCreateInSection = (workspaceId: string | null) => {
    expansion.expandSection(sectionKey(workspaceId));
    void createNote({ workspaceId });
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
    setOverZone("inside");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setRenamingId(null);
    setActiveDragId(String(event.active.id));
    setOverId(null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
    setOverZone(zoneOf(event));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = resolveDropTarget(
      summaries,
      String(event.active.id),
      event.over ? String(event.over.id) : null,
      zoneOf(event),
      expansion.collapsedNoteIds,
    );
    clearDragState();
    if (target) {
      applyMove(String(event.active.id), target);
    }
  };

  const renderSection = (section: (typeof sections)[number], index: number) => {
    const key = sectionKey(section.workspaceId);
    const collapsed = expansion.isSectionCollapsed(key);
    const title = sectionTitle(section.workspaceId);
    const nodes = collapsed
      ? []
      : buildVisibleNoteTree(section.notes, expansion.collapsedNoteIds);
    const parentIds = section.notes
      .filter((note) =>
        section.notes.some((child) => child.parentId === note.id),
      )
      .map((note) => note.id);
    const allPagesCollapsed = parentIds.every((id) =>
      expansion.collapsedNoteIds.has(id),
    );
    return (
      <div key={key} className="flex flex-col gap-0.5">
        <NoteSectionHeader
          workspaceId={section.workspaceId}
          title={title}
          collapsed={collapsed}
          first={index === 0}
          isDropTarget={
            dropTarget !== undefined &&
            overId === sectionDropId(section.workspaceId)
          }
          pages={
            collapsed || parentIds.length === 0
              ? null
              : {
                  allCollapsed: allPagesCollapsed,
                  onToggle: () =>
                    expansion.setNotesCollapsed(parentIds, !allPagesCollapsed),
                }
          }
          onToggle={() => expansion.toggleSection(key)}
          onCreate={() => handleCreateInSection(section.workspaceId)}
        />
        {nodes.map(({ note, depth, hasChildren }) => (
          <NoteTreeItem
            key={note.id}
            note={note}
            depth={depth}
            isActive={note.id === activeNoteId}
            isExpanded={!expansion.collapsedNoteIds.has(note.id)}
            hasChildren={hasChildren}
            isRenaming={note.id === renamingId}
            drop={overId === note.id ? dropTarget : undefined}
            moveDestinations={listMoveDestinations(
              summaries,
              note.id,
              moveSections,
            )}
            onOpen={(id) => {
              if (renamingId || activeDragId) {
                return;
              }
              void openNote(id);
            }}
            onToggleExpand={expansion.toggleNote}
            onStartRename={setRenamingId}
            onCancelRename={() => setRenamingId(null)}
            onCommitRename={handleCommitRename}
            onCreateChild={handleCreateChild}
            onMove={applyMove}
            onDelete={() => setPendingDelete(note)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-2 px-2 pb-2">
      <SidebarPanelHeader
        title={t("sidebar.title")}
        action={
          <TitlebarIconButton
            aria-label={t("sidebar.newNote")}
            onClick={() => handleCreateInSection(preferredSection)}
          >
            <Plus className="size-3.5" />
          </TitlebarIconButton>
        }
      />

      {loading && summaries.length === 0 ? (
        <div className="flex-1" />
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title={t("sidebar.empty.title")}
          description={t("sidebar.empty.description")}
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          collisionDetection={collisionDetection}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDragState}
        >
          <ScrollArea className="min-h-0 min-w-0 w-full flex-1">
            <div className="flex w-full min-w-0 flex-col gap-1">
              {sections.map(renderSection)}
            </div>
          </ScrollArea>
          <DragOverlay dropAnimation={null}>
            {activeDragNote ? (
              <NoteTreeDragPreview note={activeDragNote} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <NoteDeleteDialog
        note={pendingDelete}
        hasChildren={
          pendingDelete !== null &&
          summaries.some((note) => note.parentId === pendingDelete.id)
        }
        onClose={() => setPendingDelete(null)}
        onConfirm={(id) => {
          void deleteNote(id);
        }}
      />
    </div>
  );
}
