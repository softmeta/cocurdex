import type { IssueRecord } from "@cocurdex/shared";
import { atom } from "jotai";
import { issuesIpc } from "./issues-ipc";
import { activeViewIdAtom } from "./issues-store";

export interface IssueDetailState {
  bodyEpoch: number;
  card: IssueRecord;
}

export const issueDetailAtom = atom<IssueDetailState | null>(null);
const issueDetailRequestAtom = atom(0);

export const openIssueDetailAtom = atom(
  null,
  async (get, set, target: IssueRecord | string) => {
    const requestId = get(issueDetailRequestAtom) + 1;
    set(issueDetailRequestAtom, requestId);
    const issueId = typeof target === "string" ? target : target.id;
    if (typeof target !== "string") {
      set(issueDetailAtom, { bodyEpoch: 0, card: target });
    }
    try {
      const full = await issuesIpc.getIssue({
        id: issueId,
        viewId: get(activeViewIdAtom),
      });
      if (get(issueDetailRequestAtom) !== requestId || !full) {
        return;
      }
      set(issueDetailAtom, { bodyEpoch: 1, card: full });
    } catch {
      return;
    }
  },
);

export const closeIssueDetailAtom = atom(null, (get, set) => {
  set(issueDetailRequestAtom, get(issueDetailRequestAtom) + 1);
  set(issueDetailAtom, null);
});
