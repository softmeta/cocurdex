import {
  DEFAULT_VIEW_ID,
  type IssueRecord,
  isIssueColumnField,
  type ViewDisplay,
  type ViewFilter,
  type ViewFull,
  type ViewGroupBy,
  type ViewLayout,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { ListTodo } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarToggleButton } from "@/app/layout/titlebar-icon-button";
import { ResizableSidebar, WORKBENCH_SIDEBAR_WIDTH_PX } from "@/components";
import { EmptyState } from "@/components/ui";
import { useDataSync } from "@/features/data-sync";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { cn, useMountEffect } from "@/lib";
import { IssuesBoard, mergeFilters } from "./board";
import { buildComposeDraft } from "./compose-draft";
import {
  type IssueComposeDraft,
  IssueCreateDialog,
  type IssueDetailActions,
  IssueDetailPage,
  type IssueDetailStepper,
  type IssueFieldOptions,
  type IssueSaveRequest,
} from "./detail";
import { issueStep, orderedIssueIds } from "./group-issues";
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
  deleteIssueAtom,
  deleteViewAtom,
  type IssueMovePayload,
  issueLoadingAtom,
  issueViewsAtom,
  loadIssuesAtom,
  moveIssueAtom,
  moveIssueLocalAtom,
  saveFiltersAsViewAtom,
  updateColumnAtom,
  updateIssueAtom,
  updateViewAtom,
} from "./issues-store";
import { IssuesToolbar } from "./issues-toolbar";
import { IssuesList } from "./list";
import {
  DeleteViewDialog,
  IssuesSidebar,
  presetScopeFilters,
  useIssueNav,
  useIssueNavScopeLabel,
  useIssueNavTitle,
} from "./sidebar";
import { IssueStatusesDialog } from "./statuses";

function buildDetailStepper(
  board: ViewFull | null,
  issueId: string | null,
  open: (issue: IssueRecord) => void,
): IssueDetailStepper | null {
  if (!board || !issueId) return null;
  const step = issueStep(orderedIssueIds(board.columns, board.issues), issueId);
  if (!step) return null;
  const openById = (id: string | null) => {
    const issue = id ? board.issues.find((entry) => entry.id === id) : null;
    return issue ? () => open(issue) : null;
  };
  return {
    position: step.position,
    total: step.total,
    onPrevious: openById(step.previousId),
    onNext: openById(step.nextId),
  };
}

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
  const issueDetail = useAtomValue(issueDetailAtom);
  const openIssueDetail = useSetAtom(openIssueDetailAtom);
  const closeIssueDetail = useSetAtom(closeIssueDetailAtom);
  const moveIssue = useSetAtom(moveIssueAtom);
  const moveIssueLocal = useSetAtom(moveIssueLocalAtom);
  const updateView = useSetAtom(updateViewAtom);
  const saveFiltersAsView = useSetAtom(saveFiltersAsViewAtom);
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
    [activeBoard, activeWorkspaceId, workspaces],
  );

  const handleRenameColumn = useCallback(
    (id: string, title: string) => {
      void updateColumn({ id, title });
    },
    [updateColumn],
  );

  const handleMoveIssue = useCallback(
    (move: IssueMovePayload) => {
      void moveIssue(move);
    },
    [moveIssue],
  );

  const handleSaveIssue = useCallback(
    async (request: IssueSaveRequest) => {
      const { values } = request;
      const groupBy = activeBoard?.view.groupBy ?? "status";
      const columnId = isIssueColumnField(groupBy)
        ? values[groupBy]
        : undefined;
      const created = await createIssue({ columnId, ...values });
      return created !== null;
    },
    [activeBoard?.view.groupBy, createIssue],
  );

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
      handleAddCard(parent.columnId, parent);
    },
    onAddRelation: (change) => {
      void addIssueRelation(change);
    },
    onRemoveRelation: (change) => {
      void removeIssueRelation(change);
    },
    onComment: commentIssue,
  };

  const activeSummary = boards.find((b) => b.id === activeBoardId) ?? null;
  const groupBy =
    activeSummary?.groupBy ?? activeBoard?.view.groupBy ?? "status";
  const layout = activeSummary?.layout ?? activeBoard?.view.layout ?? "board";
  const loadedBoard =
    activeBoard?.view.id === activeBoardId ? activeBoard : null;
  const nav = useIssueNav({ board: loadedBoard });
  const viewBoard = nav.scopedBoard;
  const customViews = boards.filter((view) => view.id !== DEFAULT_VIEW_ID);
  const viewTitle = useIssueNavTitle(nav.selection, boards);

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

  const display = activeBoard?.view.display;
  const handleDisplayChange = useCallback(
    (next: ViewDisplay) => {
      void updateView({ display: next });
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

  const scopeLabel = useIssueNavScopeLabel(nav.selection);

  const handleSaveView = async (title: string) => {
    const scope =
      nav.selection.kind === "issues"
        ? presetScopeFilters(nav.selection.preset)
        : [];
    const created = await saveFiltersAsView({
      title,
      filters: mergeFilters(viewFilters, scope),
    });
    if (created) {
      nav.select({ kind: "view", viewId: created.id });
    }
  };

  if (loading) {
    return null;
  }

  const sidebarToggle = sidebarCollapsed ? (
    <SidebarToggleButton
      label={t("sidebar.expand")}
      open={false}
      onToggle={() => setSidebarCollapsed(false)}
    />
  ) : null;
  const fieldOptions: IssueFieldOptions | null = viewBoard
    ? {
        statusOptions: viewBoard.statusOptions,
        priorityOptions: viewBoard.priorityOptions,
        workspaces,
        labels: viewBoard.labels,
        issues: loadedBoard?.issues ?? viewBoard.issues,
      }
    : null;
  const detailPageOpen = issueDetail !== null && fieldOptions !== null;
  const stepper = buildDetailStepper(
    viewBoard,
    issueDetail?.card.id ?? null,
    (issue) => {
      void openIssueDetail(issue);
    },
  );

  return (
    <div className="flex min-h-0 flex-1">
      {sidebarCollapsed ? null : (
        <ResizableSidebar
          defaultWidth={WORKBENCH_SIDEBAR_WIDTH_PX}
          ariaLabel={t("sidebar.resize")}
        >
          <IssuesSidebar
            selection={nav.selection}
            onSelect={(selection) => {
              closeIssueDetail();
              nav.select(selection);
            }}
            views={customViews}
            onDeleteView={setPendingDeleteBoardId}
            onRenameView={(title) => {
              void updateView({ title });
            }}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </ResizableSidebar>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor-canvas/80">
        {issueDetail && viewBoard && fieldOptions ? (
          <IssueDetailPage
            state={issueDetail}
            viewTitle={viewBoard.view.title}
            options={fieldOptions}
            actions={detailActions}
            leading={sidebarToggle}
            stepper={stepper}
            onBack={closeIssueDetail}
          />
        ) : null}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            detailPageOpen && "hidden",
          )}
        >
          {boards.length > 0 || sidebarCollapsed ? (
            <IssuesToolbar
              selection={nav.selection}
              viewTitle={viewTitle}
              scopeLabel={scopeLabel}
              leading={sidebarToggle}
              showViewControls={boards.length > 0}
              filters={viewFilters}
              workspaces={workspaces}
              labels={activeBoard?.labels ?? []}
              statuses={activeBoard?.statusOptions ?? []}
              layout={layout}
              groupBy={groupBy}
              onSelect={nav.select}
              onFiltersChange={handleFiltersChange}
              onLayoutChange={handleLayout}
              onGroupByChange={handleGroupBy}
              display={display}
              onDisplayChange={handleDisplayChange}
              onSaveView={(title) => {
                void handleSaveView(title);
              }}
            />
          ) : null}
          {viewBoard ? (
            layout === "list" ? (
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
                onMoveIssueLocal={moveIssueLocal}
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
            )
          ) : boards.length > 0 ? (
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
        {viewBoard && fieldOptions ? (
          <>
            <IssueCreateDialog
              composeDraft={composeDraft}
              viewTitle={viewBoard.view.title}
              options={fieldOptions}
              onCreateLabel={createIssueLabel}
              onClose={() => setComposeDraft(null)}
              onSave={handleSaveIssue}
            />
            <DeleteViewDialog
              view={pendingDeleteBoard}
              onClose={() => setPendingDeleteBoardId(null)}
              onConfirm={(viewId) => {
                void deleteView(viewId);
              }}
            />
            <IssueStatusesDialog />
          </>
        ) : null}
      </div>
    </div>
  );
}
