import type {
  IssueDetail,
  IssueRecord,
  IssueRelationDirection,
  IssueRelationKind,
  IssueRelationPayload,
} from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { issuesIpc } from "./issues-ipc";
import {
  activeViewAtom,
  activeViewIdAtom,
  type IssueFieldChanges,
  reportIssueError,
  updateIssueAtom,
} from "./issues-store";

export interface IssueDetailState {
  bodyEpoch: number;
  bodyStatus: "loading" | "ready" | "error";
  card: IssueRecord;
  detail: IssueDetail | null;
}

export interface IssueRelationChange {
  kind: IssueRelationKind;
  direction: IssueRelationDirection;
  relatedId: string;
}

function relationPayload(
  issueId: string,
  change: IssueRelationChange,
): IssueRelationPayload {
  return change.direction === "outgoing"
    ? { id: issueId, kind: change.kind, relatedId: change.relatedId }
    : { id: change.relatedId, kind: change.kind, relatedId: issueId };
}

export const issueDetailAtom = atom<IssueDetailState | null>(null);
export const issueDetailIdAtom = atom<string | null>(null);
const issueDetailRequestAtom = atom(0);

export const openIssueDetailAtom = atom(
  null,
  async (get, set, target: IssueRecord | string) => {
    const requestId = get(issueDetailRequestAtom) + 1;
    set(issueDetailRequestAtom, requestId);
    const issueId = typeof target === "string" ? target : target.id;
    set(issueDetailIdAtom, issueId);
    if (typeof target !== "string") {
      set(issueDetailAtom, {
        bodyEpoch: 0,
        bodyStatus: "loading",
        card: target,
        detail: null,
      });
    }
    const markFailed = () => {
      const current = get(issueDetailAtom);
      if (get(issueDetailRequestAtom) === requestId && current) {
        set(issueDetailAtom, { ...current, bodyStatus: "error" });
      }
    };
    try {
      const detail = await issuesIpc.getDetail({
        id: issueId,
        viewId: get(activeViewIdAtom),
      });
      if (get(issueDetailRequestAtom) !== requestId) {
        return;
      }
      if (!detail) {
        if (typeof target === "string") {
          toast.error(i18n.t("issues:detail.notFound"));
          set(issueDetailIdAtom, null);
        }
        markFailed();
        return;
      }
      set(issueDetailAtom, {
        bodyEpoch: 0,
        bodyStatus: "ready",
        card: detail.issue,
        detail,
      });
    } catch {
      markFailed();
    }
  },
);

export const closeIssueDetailAtom = atom(null, (get, set) => {
  set(issueDetailRequestAtom, get(issueDetailRequestAtom) + 1);
  set(issueDetailAtom, null);
  set(issueDetailIdAtom, null);
});

function applyDetail(get: Getter, set: Setter, detail: IssueDetail | null) {
  const current = get(issueDetailAtom);
  if (detail && current?.card.id === detail.issue.id) {
    set(issueDetailAtom, { ...current, card: detail.issue, detail });
  }
}

async function runDetailMutation(
  get: Getter,
  set: Setter,
  mutation: (issueId: string) => Promise<IssueDetail>,
): Promise<boolean> {
  const issueId = get(issueDetailAtom)?.card.id;
  if (!issueId) {
    return false;
  }
  try {
    const detail = await mutation(issueId);
    applyDetail(
      get,
      set,
      detail.issue.id === issueId
        ? detail
        : await issuesIpc.getDetail({
            id: issueId,
            viewId: get(activeViewIdAtom),
          }),
    );
    return true;
  } catch (error) {
    reportIssueError(error);
    return false;
  }
}

export const refreshIssueDetailAtom = atom(null, async (get, set) => {
  const current = get(issueDetailAtom);
  if (current?.bodyStatus !== "ready") {
    return;
  }
  try {
    applyDetail(
      get,
      set,
      await issuesIpc.getDetail({
        id: current.card.id,
        viewId: get(activeViewIdAtom),
      }),
    );
  } catch {
    return;
  }
});

export const commentIssueAtom = atom(null, (get, set, body: string) =>
  runDetailMutation(get, set, (id) => issuesIpc.comment({ id, body })),
);

export const addIssueRelationAtom = atom(
  null,
  (get, set, change: IssueRelationChange) =>
    runDetailMutation(get, set, (id) =>
      issuesIpc.addRelation(relationPayload(id, change)),
    ),
);

export const removeIssueRelationAtom = atom(
  null,
  (get, set, change: IssueRelationChange) =>
    runDetailMutation(get, set, (id) =>
      issuesIpc.removeRelation(relationPayload(id, change)),
    ),
);

let detailSaveChain: Promise<unknown> = Promise.resolve();

function knownRevision(get: Getter, issueId: string): number | undefined {
  const current = get(issueDetailAtom);
  if (current?.card.id === issueId) {
    return current.card.revision;
  }
  return get(activeViewAtom)?.issues.find((issue) => issue.id === issueId)
    ?.revision;
}

async function reloadAfterFailedSave(get: Getter, set: Setter, id: string) {
  try {
    const detail = await issuesIpc.getDetail({
      id,
      viewId: get(activeViewIdAtom),
    });
    const current = get(issueDetailAtom);
    if (detail && current?.card.id === id) {
      set(issueDetailAtom, {
        bodyEpoch: current.bodyEpoch + 1,
        bodyStatus: "ready",
        card: detail.issue,
        detail,
      });
    }
  } catch {
    return;
  }
}

export const saveIssueDetailAtom = atom(
  null,
  (get, set, request: { id: string; changes: IssueFieldChanges }) => {
    const { id, changes } = request;
    const current = get(issueDetailAtom);
    if (current?.card.id === id) {
      set(issueDetailAtom, {
        ...current,
        card: { ...current.card, ...changes },
      });
    }
    const run = async () => {
      const updated = await set(updateIssueAtom, {
        id,
        expectedRevision: knownRevision(get, id),
        ...changes,
      });
      const latest = get(issueDetailAtom);
      if (latest?.card.id !== id) {
        return updated !== null;
      }
      if (updated) {
        set(issueDetailAtom, { ...latest, card: updated });
        return true;
      }
      await reloadAfterFailedSave(get, set, id);
      return false;
    };
    const result = detailSaveChain.then(run, run);
    detailSaveChain = result;
    return result;
  },
);
