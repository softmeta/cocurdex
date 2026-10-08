import type { NoteSummary } from "@cocurdex/shared";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useAtomValue, useSetAtom } from "jotai";
import { NotebookPen, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { SidebarPanelHeader } from "@/components";
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
  listMoveDestinations,
  type NoteMoveTarget,
  resolveDropTarget,
  sectionDropId,
} from "./note-moves";
import { NoteSectionHeader } from "./note-section-header";
import { groupNoteSections, noteSectionId } from "./note-sections";
import { NoteTreeDragPreview, NoteTreeItem } from "./note-tree-item";
import { useNoteTreeExpansion } from "./use-note-tree-expansion";

const PERSONAL_SECTION_KEY = "__personal__";

function sectionKey(workspaceId: string | null): string {
  return workspaceId ?? PERSONAL_SECTION_KEY;
}

export function NotesSidebar({ onCollapse }: { onCollapse: () => void }) {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const expansion = useNoteTreeExpansion({
    summaries,
    activeNoteId,
    initiallyCollapsedSections: () =>
      workspaces
        .map((workspace) => workspace.id)
        .filter((id) => id !== activeWorkspaceId),
  });

  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
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
  const activeNote = summaries.find((note) => note.id === activeNoteId);
  const activeSectionKey = activeNote
    ? sectionKey(noteSectionId(activeNote, summaries, workspaceIds))
    : null;
  const preferredSection =
    activeWorkspaceId && workspaceIds.has(activeWorkspaceId)
      ? activeWorkspaceId
      : null;

  const dropTarget =
    activeDragId && overId
      ? resolveDropTarget(summaries, activeDragId, overId)
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
  };

  const handleDragStart = (event: DragStartEvent) => {
    setRenamingId(null);
    setActiveDragId(String(event.active.id));
    setOverId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const target = resolveDropTarget(
      summaries,
      String(event.active.id),
      event.over ? String(event.over.id) : null,
    );
    clearDragState();
    if (target) {
      applyMove(String(event.active.id), target);
    }
  };

  const renderSection = (section: (typeof sections)[number]) => {
    const key = sectionKey(section.workspaceId);
    const collapsed =
      expansion.isSectionCollapsed(key) && key !== activeSectionKey;
    const title = sectionTitle(section.workspaceId);
    const nodes = collapsed
      ? []
      : buildVisibleNoteTree(section.notes, expansion.collapsedNoteIds);
    return (
      <div key={key} className="flex flex-col gap-0.5">
        <NoteSectionHeader
          workspaceId={section.workspaceId}
          title={title}
          collapsed={collapsed}
          isDropTarget={
            dropTarget !== undefined &&
            overId === sectionDropId(section.workspaceId)
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
            isDropTarget={dropTarget !== undefined && overId === note.id}
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
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-2 p-2">
      <SidebarPanelHeader
        title={t("sidebar.title")}
        collapseLabel={t("sidebar.collapse")}
        onCollapse={onCollapse}
        action={
          <TitlebarIconButton
            aria-label={t("sidebar.newNote")}
            onClick={() => handleCreateInSection(preferredSection)}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
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
          onDragOver={handleDragOver}
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
