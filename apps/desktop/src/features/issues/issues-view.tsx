import {
  DEFAULT_VIEW_ID,
  type IssueRecord,
  type ViewFilter,
  type ViewGroupBy,
  type ViewLayout,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ListTodo } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResizableSidebar,
  SidebarCollapsedRail,
  WORKBENCH_SIDEBAR_WIDTH_PX,
} from "@/components";
import { EmptyState, Text } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { useMountEffect } from "@/lib";
import { IssuesBoard, ViewDisplayMenu, ViewFilterMenu } from "./board";
import { buildComposeDraft } from "./compose-draft";
import {
  CardDetailDialog,
  type IssueComposeDraft,
  type IssueDetailActions,
  type IssueSaveRequest,
} from "./dialogs";
import {
  addIssueRelationAtom,
  closeIssueDetailAtom,
  commentIssueAtom,
  issueDetailAtom,
  openIssueDetailAtom,
  removeIssueRelationAtom,
} from "./issue-detail-store";
import {
  activeViewAtom,
  activeViewIdAtom,
  createIssueAtom,
  createIssueLabelAtom,
  createViewAtom,
  deleteIssueAtom,
  deleteViewAtom,
  issueLoadingAtom,
  issueViewsAtom,
  loadIssuesAtom,
  moveColumnAtom,
  moveIssueAtom,
  moveIssueLocalAtom,
  updateColumnAtom,
  updateIssueAtom,
  updateViewAtom,
} from "./issues-store";
import { IssuesList } from "./list";
import {
  DeleteViewDialog,
  type IssueNavSession,
  IssuesSidebar,
  useIssueNav,
  useIssueNavTitle,
} from "./sidebar";

export function IssuesView({
  sessions,
}: {
  sessions: readonly IssueNavSession[];
}) {
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
  const issueDetail = useAtomValue(issueDetailAtom);
  const openIssueDetail = useSetAtom(openIssueDetailAtom);
  const closeIssueDetail = useSetAtom(closeIssueDetailAtom);
  const moveIssue = useSetAtom(moveIssueAtom);
  const moveIssueLocal = useSetAtom(moveIssueLocalAtom);
  const moveColumn = useSetAtom(moveColumnAtom);
  const updateView = useSetAtom(updateViewAtom);
  const createView = useSetAtom(createViewAtom);
  const deleteView = useSetAtom(deleteViewAtom);
  const createIssueLabel = useSetAtom(createIssueLabelAtom);
  const commentIssue = useSetAtom(commentIssueAtom);
  const addIssueRelation = useSetAtom(addIssueRelationAtom);
  const removeIssueRelation = useSetAtom(removeIssueRelationAtom);

  const [composeDraft, setComposeDraft] = useState<IssueComposeDraft | null>(
    null,
  );
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
    (columnId: string, parent: IssueRecord | null = null) => {
      if (!activeBoard) return;
      closeIssueDetail();
      setComposeDraft(
        buildComposeDraft({
          board: activeBoard,
          columnId,
          parent,
          activeWorkspaceId,
          workspaceIds: workspaces.map((workspace) => workspace.id),
        }),
      );
    },
    [activeBoard, activeWorkspaceId, closeIssueDetail, workspaces],
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
    async (request: IssueSaveRequest) => {
      if (request.kind === "update") {
        const updated = await updateIssue({
          id: request.id,
          expectedRevision: request.expectedRevision,
          ...request.changes,
        });
        return updated !== null;
      }
      const { values } = request;
      const columnId =
        activeBoard?.view.groupBy === "priority"
          ? values.priority
          : values.status;
      const created = await createIssue({ columnId, ...values });
      return created !== null;
    },
    [activeBoard?.view.groupBy, createIssue, updateIssue],
  );

  const closeIssueDialog = useCallback(() => {
    closeIssueDetail();
    setComposeDraft(null);
  }, [closeIssueDetail]);

  const handleEditCard = useCallback(
    (card: IssueRecord) => {
      setComposeDraft(null);
      void openIssueDetail(card);
    },
    [openIssueDetail],
  );

  const detailActions: IssueDetailActions = {
    onCreateLabel: createIssueLabel,
    onOpenIssue: (issueId) => {
      setComposeDraft(null);
      void openIssueDetail(issueId);
    },
    onAddSubIssue: (parent) => {
      const groupBy = activeBoard?.view.groupBy ?? "status";
      handleAddCard(
        groupBy === "priority" ? parent.priority : parent.status,
        parent,
      );
    },
    onAddRelation: (change) => {
      void addIssueRelation(change);
    },
    onRemoveRelation: (change) => {
      void removeIssueRelation(change);
    },
    onComment: commentIssue,
  };

  // Prefer the selected view's summary so layout/groupBy never stick to the
  // previously loaded board while selectBoard is in flight.
  const activeSummary = boards.find((b) => b.id === activeBoardId) ?? null;
  const groupBy =
    activeSummary?.groupBy ?? activeBoard?.view.groupBy ?? "status";
  const layout = activeSummary?.layout ?? activeBoard?.view.layout ?? "board";
  const loadedBoard =
    activeBoard?.view.id === activeBoardId ? activeBoard : null;
  const nav = useIssueNav({ board: loadedBoard, sessions });
  const viewBoard = nav.scopedBoard;
  const customViews = boards.filter((view) => view.id !== DEFAULT_VIEW_ID);
  const navTitle = useIssueNavTitle(nav.selection, boards);

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
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
          ariaLabel={t("sidebar.resize")}
        >
          <IssuesSidebar
            selection={nav.selection}
            onSelect={nav.select}
            agentRunningCount={nav.agentRunningCount}
            views={customViews}
            onCreateView={() => {
              void createView(t("sidebar.newBoardTitle"));
            }}
            onDeleteView={setPendingDeleteBoardId}
            onRenameView={(title) => {
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
            className="flex h-8 shrink-0 items-center gap-1 border-b border-editor-border px-2"
            data-testid="issues-view-display-bar"
          >
            <Text
              size="body"
              weight="medium"
              className="me-auto min-w-0 truncate ps-1"
            >
              {navTitle}
            </Text>
            <ViewFilterMenu
              filters={viewFilters}
              workspaces={workspaces}
              labels={activeBoard?.labels ?? []}
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
                onSetColumnCategory={(id, category) => {
                  void updateColumn({ id, category });
                }}
              />
            )}
            <CardDetailDialog
              card={issueDetail?.card ?? null}
              detail={issueDetail?.detail ?? null}
              composeDraft={composeDraft}
              bodyEpoch={issueDetail?.bodyEpoch ?? 0}
              bodyStatus={issueDetail?.bodyStatus}
              open={issueDetail !== null || composeDraft !== null}
              viewTitle={viewBoard.view.title}
              statusOptions={viewBoard.statusOptions}
              priorityOptions={viewBoard.priorityOptions}
              workspaces={workspaces}
              labels={viewBoard.labels}
              issues={loadedBoard?.issues ?? viewBoard.issues}
              groupBy={groupBy}
              actions={detailActions}
              onClose={closeIssueDialog}
              onSave={handleSaveIssue}
            />
            <DeleteViewDialog
              view={pendingDeleteBoard}
              onClose={() => setPendingDeleteBoardId(null)}
              onConfirm={(viewId) => {
                void deleteView(viewId);
              }}
            />
          </>
        ) : boards.length > 0 ? (
          // Selected view id changed; full board payload still loading.
          <div className="flex-1" />
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
