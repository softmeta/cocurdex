import type {
  IssueRecord,
  ViewColumnRecord,
  ViewFilter,
  ViewFull,
  ViewGroupBy,
  ViewLayout,
  ViewSummary,
} from "@cocurdex/shared";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { atom } from "jotai";
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

export const createViewAtom = atom(null, async (_get, set, title?: string) => {
  const view = await issuesIpc.createView({ title });
  await refreshViewList(set);
  set(activeViewIdAtom, view.id);
  await loadActiveView(set, view.id);
  return view;
});

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
  } catch {
    // External refresh is best-effort; preserve the current board.
  }
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
    },
  ) => {
    const current = get(activeViewAtom);
    if (!current) {
      return;
    }
    const full = await issuesIpc.updateView({
      viewId: current.view.id,
      expectedRevision: current.view.revision,
      ...payload,
    });
    set(activeViewAtom, full);
    set(
      issueViewsAtom,
      get(issueViewsAtom).map((view) =>
        view.id === full.view.id ? toViewSummary(full.view) : view,
      ),
    );
  },
);

export const createColumnAtom = atom(null, async (get, set, title?: string) => {
  const viewId = get(activeViewIdAtom);
  const column = await issuesIpc.createColumn({ viewId, title });
  const current = get(activeViewAtom);
  if (current) {
    set(activeViewAtom, {
      ...current,
      columns: [...current.columns, column],
    });
  }
  return column;
});

export const updateColumnAtom = atom(
  null,
  async (
    get,
    set,
    payload: { id: string; title?: string; color?: string | null },
  ) => {
    const updated = await issuesIpc.updateColumn({
      viewId: get(activeViewIdAtom),
      ...payload,
    });
    const current = get(activeViewAtom);
    if (current) {
      set(activeViewAtom, {
        ...current,
        columns: current.columns.map((column) =>
          column.id === updated.id ? updated : column,
        ),
      });
    }
  },
);

export const deleteColumnAtom = atom(
  null,
  async (get, set, columnId: string) => {
    const viewId = get(activeViewIdAtom);
    await issuesIpc.deleteColumn({ viewId, id: columnId });
    await loadActiveView(set, viewId);
  },
);

export const createIssueAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      columnId: string;
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      workspaceId?: string | null;
    },
  ) => {
    const viewId = get(activeViewIdAtom);
    const issue = await issuesIpc.createIssue({ viewId, ...payload });
    await loadActiveView(set, viewId);
    return issue;
  },
);

export const updateIssueAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      id: string;
      title?: string;
      description?: string | null;
      color?: string | null;
      status?: string;
      priority?: string;
      workspaceId?: string | null;
    },
  ) => {
    const viewId = get(activeViewIdAtom);
    const issue = get(activeViewAtom)?.issues.find(
      (candidate) => candidate.id === payload.id,
    );
    await issuesIpc.updateIssue({
      viewId,
      expectedRevision: issue?.revision,
      ...payload,
    });
    await loadActiveView(set, viewId);
  },
);

export const moveIssueLocalAtom = atom(
  null,
  (get, set, payload: { id: string; columnId: string; sortOrder: number }) => {
    const current = get(activeViewAtom);
    if (!current) {
      return;
    }
    set(activeViewAtom, {
      ...current,
      issues: current.issues.map((issue) =>
        issue.id === payload.id ? { ...issue, ...payload } : issue,
      ),
    });
  },
);

export const moveIssueAtom = atom(
  null,
  async (
    get,
    set,
    payload: { id: string; columnId: string; sortOrder: number },
  ) => {
    const current = get(activeViewAtom);
    const issue = current?.issues.find(
      (candidate) => candidate.id === payload.id,
    );
    set(moveIssueLocalAtom, payload);
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
  },
);

export const moveColumnAtom = atom(
  null,
  async (get, set, payload: { id: string; sortOrder: number }) => {
    const moved = await issuesIpc.moveColumn({
      viewId: get(activeViewIdAtom),
      ...payload,
    });
    const current = get(activeViewAtom);
    if (current) {
      set(activeViewAtom, {
        ...current,
        columns: current.columns.map((column) =>
          column.id === moved.id ? moved : column,
        ),
      });
    }
  },
);

export const deleteIssueAtom = atom(null, async (get, set, issueId: string) => {
  const current = get(activeViewAtom);
  const issue = current?.issues.find((candidate) => candidate.id === issueId);
  await issuesIpc.deleteIssue({
    id: issueId,
    expectedRevision: issue?.revision,
  });
  if (current) {
    set(activeViewAtom, {
      ...current,
      issues: current.issues.filter((candidate) => candidate.id !== issueId),
    });
  }
});

export const getIssueAtom = atom(
  null,
  async (get, _set, id: string): Promise<IssueRecord> =>
    issuesIpc.getIssue({ id, viewId: get(activeViewIdAtom) }),
);

function toViewSummary(view: ViewFull["view"]): ViewSummary {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...summary } = view;
  return summary;
}

export type { IssueRecord, ViewColumnRecord, ViewFull };
