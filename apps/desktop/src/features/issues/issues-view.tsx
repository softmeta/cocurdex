import type {
  IssueRecord,
  ViewFilter,
  ViewGroupBy,
  ViewLayout,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ListTodo } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppConfirmDialog,
  ResizableSidebar,
  SidebarCollapsedRail,
} from "@/components";
import { EmptyState, Spinner } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { useMountEffect } from "@/lib";
import { IssuesBoard, ViewDisplayMenu, ViewFilterMenu } from "./board";
import { CardDetailDialog, type IssueComposeDraft } from "./dialogs";
import {
  activeViewAtom,
  activeViewIdAtom,
  createIssueAtom,
  createViewAtom,
  deleteIssueAtom,
  deleteViewAtom,
  getIssueAtom,
  issueLoadingAtom,
  issueViewsAtom,
  loadIssuesAtom,
  moveColumnAtom,
  moveIssueAtom,
  moveIssueLocalAtom,
  selectViewAtom,
  updateColumnAtom,
  updateIssueAtom,
  updateViewAtom,
} from "./issues-store";
import { IssuesList } from "./list";
import { IssuesSidebar } from "./sidebar";

const SIDEBAR_WIDTH_PX = 200;

export function IssuesView() {
  const { t } = useTranslation("issues");
  const loadIssues = useSetAtom(loadIssuesAtom);
  const loading = useAtomValue(issueLoadingAtom);
  const activeBoard = useAtomValue(activeViewAtom);
  const boards = useAtomValue(issueViewsAtom);
  const activeBoardId = useAtomValue(activeViewIdAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);

  const updateColumn = useSetAtom(updateColumnAtom);
  const createIssue = useSetAtom(createIssueAtom);
  const deleteIssue = useSetAtom(deleteIssueAtom);
  const updateIssue = useSetAtom(updateIssueAtom);
  const getIssue = useSetAtom(getIssueAtom);
  const moveIssue = useSetAtom(moveIssueAtom);
  const moveIssueLocal = useSetAtom(moveIssueLocalAtom);
  const moveColumn = useSetAtom(moveColumnAtom);
  const updateView = useSetAtom(updateViewAtom);
  const selectBoard = useSetAtom(selectViewAtom);
  const createView = useSetAtom(createViewAtom);
  const deleteView = useSetAtom(deleteViewAtom);

  const [editingCard, setEditingCard] = useState<IssueRecord | null>(null);
  const [composeDraft, setComposeDraft] = useState<IssueComposeDraft | null>(
    null,
  );
  /** Bumps when full markdown arrives so the body editor remounts once. */
  const [bodyEpoch, setBodyEpoch] = useState(0);
  /** Invalidate in-flight getIssue when closing or opening another card. */
  const editRequestRef = useRef(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingDeleteBoardId, setPendingDeleteBoardId] = useState<
    string | null
  >(null);
  const pendingDeleteBoard =
    boards.find((b) => b.id === pendingDeleteBoardId) ?? null;

  useMountEffect(() => {
    void loadIssues();
  });

  useDataSync("issues");

  const handleAddCard = useCallback(
    (columnId: string) => {
      const board = activeBoard;
      if (!board) return;
      // Open Linear-style compose dialog; only write to disk on create.
      const groupBy = board.view.groupBy;
      // Prefer the active view's project filter when set; else active workspace.
      const workspaceFilter = (board.view.filters ?? []).find(
        (filter) => filter.field === "workspaceId",
      );
      let defaultWorkspaceId: string | null = null;
      if (workspaceFilter?.op === "eq" && workspaceFilter.value) {
        defaultWorkspaceId = workspaceFilter.value;
      } else if (workspaceFilter?.op === "is_null") {
        defaultWorkspaceId = null;
      } else if (
        activeWorkspaceId &&
        workspaces.some((workspace) => workspace.id === activeWorkspaceId)
      ) {
        defaultWorkspaceId = activeWorkspaceId;
      }
      setEditingCard(null);
      setComposeDraft({
        columnId,
        status: groupBy === "status" ? columnId : "backlog",
        priority: groupBy === "priority" ? columnId : "none",
        workspaceId: defaultWorkspaceId,
      });
    },
    [activeBoard, activeWorkspaceId, workspaces],
  );

  const handleRenameColumn = useCallback(
    (id: string, title: string) => {
      void updateColumn({ id, title });
    },
    [updateColumn],
  );

  const handleMoveIssue = useCallback(
    (id: string, columnId: string, sortOrder: number) => {
      void moveIssue({ id, columnId, sortOrder });
    },
    [moveIssue],
  );

  const handleMoveIssueLocal = useCallback(
    (id: string, columnId: string, sortOrder: number) => {
      moveIssueLocal({ id, columnId, sortOrder });
    },
    [moveIssueLocal],
  );

  const handleMoveColumn = useCallback(
    (id: string, sortOrder: number) => {
      void moveColumn({ id, sortOrder });
    },
    [moveColumn],
  );

  const handleSaveIssue = useCallback(
    (payload: {
      id?: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      workspaceId: string | null;
      columnId?: string;
    }) => {
      if (payload.id) {
        void updateIssue({
          id: payload.id,
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          workspaceId: payload.workspaceId,
        });
        return;
      }
      // Place the card under the column matching the active groupBy field.
      const columnId =
        activeBoard?.view.groupBy === "priority"
          ? payload.priority
          : payload.status;
      void createIssue({
        columnId,
        title: payload.title,
        description: payload.description,
        status: payload.status,
        priority: payload.priority,
        workspaceId: payload.workspaceId,
      });
    },
    [activeBoard?.view.groupBy, createIssue, updateIssue],
  );

  const closeIssueDialog = useCallback(() => {
    editRequestRef.current += 1;
    setEditingCard(null);
    setComposeDraft(null);
    setBodyEpoch(0);
  }, []);

  /**
   * Open the dialog immediately (same as create) so the Dialog backdrop does
   * not flash after a separate loading overlay. Board/list rows only have an
   * excerpt — upgrade to full markdown in the background.
   */
  const handleEditCard = useCallback(
    (card: IssueRecord) => {
      const requestId = editRequestRef.current + 1;
      editRequestRef.current = requestId;
      setComposeDraft(null);
      setBodyEpoch(0);
      setEditingCard(card);
      void (async () => {
        try {
          const full = await getIssue(card.id);
          if (editRequestRef.current !== requestId || !full) return;
          setEditingCard(full);
          // Remount body editor once full markdown is available.
          setBodyEpoch(1);
        } catch {
          // Keep list-shaped card already shown.
        }
      })();
    },
    [getIssue],
  );

  // Prefer the selected view's summary so layout/groupBy never stick to the
  // previously loaded board while selectBoard is in flight.
  const activeSummary = boards.find((b) => b.id === activeBoardId) ?? null;
  const groupBy =
    activeSummary?.groupBy ?? activeBoard?.view.groupBy ?? "status";
  const layout = activeSummary?.layout ?? activeBoard?.view.layout ?? "board";
  // Full payload must match the selected view; otherwise list/board would
  // briefly render another view's issues under this view's display settings.
  const viewBoard = activeBoard?.view.id === activeBoardId ? activeBoard : null;

  const handleGroupBy = useCallback(
    (next: ViewGroupBy) => {
      if (groupBy === next) return;
      void updateView({ groupBy: next });
    },
    [groupBy, updateView],
  );

  const viewFilters = activeSummary?.filters ?? activeBoard?.view.filters ?? [];

  const handleFiltersChange = useCallback(
    (filters: ViewFilter[]) => {
      void updateView({ filters });
    },
    [updateView],
  );

  const handleLayout = useCallback(
    (next: ViewLayout) => {
      if (layout === next) return;
      void updateView({ layout: next });
    },
    [layout, updateView],
  );

  // Loading or first-open auto-init of `.cocurdex`. Prefer a blank pane over a
  // web-style spinner so cold-start restore feels like a native shell.
  if (loading) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1">
      {sidebarCollapsed ? (
        <SidebarCollapsedRail
          onExpand={() => setSidebarCollapsed(false)}
          expandLabel={t("sidebar.expand")}
          // Continue the display-bar border under the toggle when that bar is shown.
          chromeSeparator={boards.length > 0}
        />
      ) : (
        <ResizableSidebar
          defaultWidth={SIDEBAR_WIDTH_PX}
          ariaLabel={t("sidebar.resize")}
        >
          <IssuesSidebar
            boards={boards}
            activeBoardId={activeBoardId}
            onSelectBoard={(id) => {
              void selectBoard(id);
            }}
            onCreateBoard={() => {
              void createView(t("sidebar.newBoardTitle"));
            }}
            onDeleteBoard={setPendingDeleteBoardId}
            onRename={(title) => {
              void updateView({ title });
            }}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </ResizableSidebar>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas/80">
        {/* View-scoped chrome: lives in the content column so layout/groupBy
            read as settings for the open view, not a panel-wide control. */}
        {boards.length > 0 ? (
          <div
            className="flex h-8 shrink-0 items-center justify-end gap-1 border-b border-editor-border px-2"
            data-testid="issues-view-display-bar"
          >
            <ViewFilterMenu
              filters={viewFilters}
              workspaces={workspaces}
              onFiltersChange={handleFiltersChange}
            />
            <ViewDisplayMenu
              layout={layout}
              groupBy={groupBy}
              onLayoutChange={handleLayout}
              onGroupByChange={handleGroupBy}
            />
          </div>
        ) : null}
        {viewBoard ? (
          <>
            {layout === "list" ? (
              <IssuesList
                board={viewBoard}
                onAddCard={handleAddCard}
                onDeleteCard={(id) => {
                  void deleteIssue(id);
                }}
                onEditCard={handleEditCard}
                onUpdateCardFields={(id, fields) => {
                  void updateIssue({ id, ...fields });
                }}
              />
            ) : (
              <IssuesBoard
                board={viewBoard}
                onMoveIssue={handleMoveIssue}
                onMoveIssueLocal={handleMoveIssueLocal}
                onMoveColumn={handleMoveColumn}
                onAddCard={handleAddCard}
                onDeleteCard={(id) => {
                  void deleteIssue(id);
                }}
                onEditCard={handleEditCard}
                onUpdateCardFields={(id, fields) => {
                  void updateIssue({ id, ...fields });
                }}
                onRenameColumn={handleRenameColumn}
              />
            )}
            <CardDetailDialog
              card={editingCard}
              composeDraft={composeDraft}
              bodyEpoch={bodyEpoch}
              open={editingCard !== null || composeDraft !== null}
              viewTitle={viewBoard.view.title}
              statusOptions={viewBoard.statusOptions}
              priorityOptions={viewBoard.priorityOptions}
              workspaces={workspaces}
              groupBy={groupBy}
              onClose={closeIssueDialog}
              onSave={handleSaveIssue}
            />
            <AppConfirmDialog
              open={pendingDeleteBoard !== null}
              variant="destructive"
              title={t("sidebar.deleteViewConfirm.title")}
              description={t("sidebar.deleteViewConfirm.description", {
                title: pendingDeleteBoard?.title || t("sidebar.untitledBoard"),
              })}
              cancelLabel={t("sidebar.deleteViewConfirm.cancel")}
              confirmLabel={t("sidebar.deleteViewConfirm.confirm")}
              onOpenChange={(open) => {
                if (!open) setPendingDeleteBoardId(null);
              }}
              onConfirm={() => {
                if (pendingDeleteBoardId) {
                  void deleteView(pendingDeleteBoardId);
                }
                setPendingDeleteBoardId(null);
              }}
            />
          </>
        ) : boards.length > 0 ? (
          // Selected view id changed; full board payload still loading.
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<ListTodo />}
              title={t("empty.title")}
              description={t("empty.description")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
