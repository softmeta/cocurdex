import type {
  IssueColumnField,
  IssueLabel,
  IssueRecord,
  IssueStatusCategory,
  ViewColumnRecord,
  ViewDisplay,
  ViewFilter,
  ViewFull,
  ViewGroupBy,
  ViewLayout,
  ViewSummary,
} from "@cocurdex/shared";
import {
  DEFAULT_VIEW_ID,
  isIssueColumnField,
  isIssueConflictError,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { issuesIpc } from "./issues-ipc";

export const issueViewsAtom = atom<ViewSummary[]>([]);
export const activeViewIdAtom = atom<string>(DEFAULT_VIEW_ID);
export const activeViewAtom = atom<ViewFull | null>(null);
export const issueLoadingAtom = atom(false);

async function loadActiveView(
  set: (atom: typeof activeViewAtom, value: ViewFull | null) => void,
  viewId: string,
) {
  const full = await issuesIpc.load({ viewId });
  set(activeViewAtom, full);
  return full;
}

async function refreshViewList(
  set: (atom: typeof issueViewsAtom, value: ViewSummary[]) => void,
) {
  const views = await issuesIpc.listViews();
  set(issueViewsAtom, views);
  return views;
}

export function reportIssueError(error: unknown) {
  toast.error(
    isIssueConflictError(error)
      ? i18n.t("issues:errors.conflict")
      : i18n.t("issues:errors.saveFailed"),
  );
}

async function runIssueMutation<T>(
  get: Getter,
  set: Setter,
  mutation: () => Promise<T>,
): Promise<T | null> {
  try {
    return await mutation();
  } catch (error) {
    reportIssueError(error);
    try {
      await loadActiveView(set, get(activeViewIdAtom));
    } catch {
      return null;
    }
    return null;
  }
}

export const loadIssuesAtom = atom(null, async (_get, set) => {
  set(issueLoadingAtom, true);
  try {
    const views = await refreshViewList(set);
    const viewId =
      views.find((view) => view.id === DEFAULT_VIEW_ID)?.id ??
      views[0]?.id ??
      DEFAULT_VIEW_ID;
    set(activeViewIdAtom, viewId);
    await loadActiveView(set, viewId);
  } finally {
    set(issueLoadingAtom, false);
  }
});

export const selectViewAtom = atom(null, async (_get, set, viewId: string) => {
  set(activeViewIdAtom, viewId);
  await loadActiveView(set, viewId);
});

export const saveFiltersAsViewAtom = atom(
  null,
  async (get, set, payload: { title: string; filters: ViewFilter[] }) => {
    const source = get(activeViewAtom);
    if (!source) {
      return null;
    }
    return runIssueMutation(get, set, async () => {
      const created = await issuesIpc.createView({ title: payload.title });
      await issuesIpc.updateView({
        viewId: created.id,
        expectedRevision: created.revision,
        filters: payload.filters,
        groupBy: source.view.groupBy,
        layout: source.view.layout,
      });
      await issuesIpc.updateView({
        viewId: source.view.id,
        expectedRevision: source.view.revision,
        filters: [],
      });
      await refreshViewList(set);
      set(activeViewIdAtom, created.id);
      await loadActiveView(set, created.id);
      return created;
    });
  },
);

export const deleteViewAtom = atom(null, async (get, set, viewId: string) => {
  const view = get(issueViewsAtom).find((candidate) => candidate.id === viewId);
  await issuesIpc.deleteView({
    viewId,
    expectedRevision: view?.revision,
  });
  const views = await refreshViewList(set);
  const nextId =
    get(activeViewIdAtom) === viewId
      ? (views.find((candidate) => candidate.id === DEFAULT_VIEW_ID)?.id ??
        views[0]?.id ??
        DEFAULT_VIEW_ID)
      : get(activeViewIdAtom);
  set(activeViewIdAtom, nextId);
  await loadActiveView(set, nextId);
});

export const reloadViewAtom = atom(null, async (get, set) => {
  await refreshViewList(set);
  await loadActiveView(set, get(activeViewIdAtom));
});

export const refreshIssuesAtom = atom(null, async (get, set) => {
  if (get(issueLoadingAtom)) {
    return;
  }
  try {
    await refreshViewList(set);
    await loadActiveView(set, get(activeViewIdAtom));
  } catch {}
});

export const updateViewAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      title?: string;
      icon?: string | null;
      groupBy?: ViewGroupBy;
      layout?: ViewLayout;
      filters?: ViewFilter[];
      display?: ViewDisplay;
    },
  ) => {
    const current = get(activeViewAtom);
    if (!current) {
      return;
    }
    const full = await runIssueMutation(get, set, () =>
      issuesIpc.updateView({
        viewId: current.view.id,
        expectedRevision: current.view.revision,
        ...payload,
      }),
    );
    if (!full) {
      return;
    }
    set(activeViewAtom, full);
    set(
      issueViewsAtom,
      get(issueViewsAtom).map((view) =>
        view.id === full.view.id ? toViewSummary(full.view) : view,
      ),
    );
  },
);

function activeColumnField(get: Getter): IssueColumnField | null {
  const groupBy = get(activeViewAtom)?.view.groupBy ?? "status";
  return isIssueColumnField(groupBy) ? groupBy : null;
}

export const updateColumnAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      id: string;
      title?: string;
      color?: string | null;
      category?: IssueStatusCategory;
    },
  ) =>
    runIssueMutation(get, set, async () => {
      const field = activeColumnField(get);
      if (!field) return;
      await issuesIpc.updateColumn({ field, ...payload });
      await loadActiveView(set, get(activeViewIdAtom));
    }),
);

export const createIssueAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      columnId?: string;
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      workspaceId?: string | null;
      parentId?: string | null;
      labelIds?: string[];
    },
  ) =>
    runIssueMutation(get, set, async () => {
      const viewId = get(activeViewIdAtom);
      const issue = await issuesIpc.createIssue({ viewId, ...payload });
      await loadActiveView(set, viewId);
      return issue;
    }),
);

export interface IssueFieldChanges {
  title?: string;
  description?: string | null;
  color?: string | null;
  status?: string;
  priority?: string;
  workspaceId?: string | null;
  parentId?: string | null;
  labelIds?: string[];
}

export const updateIssueAtom = atom(
  null,
  async (
    get,
    set,
    payload: IssueFieldChanges & { id: string; expectedRevision?: number },
  ) =>
    runIssueMutation(get, set, async () => {
      const viewId = get(activeViewIdAtom);
      const issue = get(activeViewAtom)?.issues.find(
        (candidate) => candidate.id === payload.id,
      );
      const updated = await issuesIpc.updateIssue({
        viewId,
        ...payload,
        expectedRevision: payload.expectedRevision ?? issue?.revision,
      });
      await loadActiveView(set, viewId);
      return updated;
    }),
);

export interface IssueMovePayload {
  id: string;
  columnId: string;
  fromColumnId: string;
  sortOrder: number;
}

function movedColumnIds(issue: IssueRecord, move: IssueMovePayload): string[] {
  const kept = issue.columnIds.filter((id) => id !== move.fromColumnId);
  return [...new Set([...kept, move.columnId])];
}

export const moveIssueLocalAtom = atom(
  null,
  (get, set, payload: IssueMovePayload) => {
    const current = get(activeViewAtom);
    if (!current) {
      return;
    }
    set(activeViewAtom, {
      ...current,
      issues: current.issues.map((issue) => {
        if (issue.id !== payload.id) return issue;
        const columnIds = movedColumnIds(issue, payload);
        return {
          ...issue,
          columnId: columnIds[0] ?? payload.columnId,
          columnIds,
          sortOrder: payload.sortOrder,
        };
      }),
    });
  },
);

export const moveIssueAtom = atom(
  null,
  async (get, set, payload: IssueMovePayload) => {
    const issue = get(activeViewAtom)?.issues.find(
      (candidate) => candidate.id === payload.id,
    );
    set(moveIssueLocalAtom, payload);
    return runIssueMutation(get, set, async () => {
      const moved = await issuesIpc.moveIssue({
        viewId: get(activeViewIdAtom),
        expectedRevision: issue?.revision,
        ...payload,
      });
      const latest = get(activeViewAtom);
      if (latest) {
        set(activeViewAtom, {
          ...latest,
          issues: latest.issues.map((candidate) =>
            candidate.id === moved.id ? moved : candidate,
          ),
        });
      }
      return moved;
    });
  },
);

export const deleteIssueAtom = atom(null, async (get, set, issueId: string) =>
  runIssueMutation(get, set, async () => {
    const issue = get(activeViewAtom)?.issues.find(
      (candidate) => candidate.id === issueId,
    );
    await issuesIpc.deleteIssue({
      id: issueId,
      expectedRevision: issue?.revision,
    });
    const current = get(activeViewAtom);
    if (current) {
      set(activeViewAtom, {
        ...current,
        issues: current.issues.filter((candidate) => candidate.id !== issueId),
      });
    }
  }),
);

export const createIssueLabelAtom = atom(
  null,
  async (get, set, name: string): Promise<IssueLabel | null> =>
    runIssueMutation(get, set, async () => {
      const label = await issuesIpc.createLabel({ name });
      await loadActiveView(set, get(activeViewIdAtom));
      return label;
    }),
);

function toViewSummary(view: ViewFull["view"]): ViewSummary {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...summary } = view;
  return summary;
}

export type { IssueRecord, ViewColumnRecord, ViewFull };

export const issueLabelsByIdAtom = atom(
  (get) =>
    new Map(
      (get(activeViewAtom)?.labels ?? []).map((label) => [label.id, label]),
    ),
);
