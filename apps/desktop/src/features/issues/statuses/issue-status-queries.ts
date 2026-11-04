import type { IssueStatusCategory, ViewColumnRecord } from "@cocurdex/shared";
import { sortOrderForColumnPosition } from "@cocurdex/shared";
import useSWR from "swr";
import { desktopApi, requestDaemon } from "@/lib";
import { useMountEffect } from "@/lib/react-hooks";

const ISSUE_STATUSES_KEY = ["issue.listColumns", "status"] as const;

function useIssueStatusRevalidation(revalidate: () => void) {
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("issues")) revalidate();
    }),
  );
}

export function useIssueStatuses() {
  const query = useSWR(
    ISSUE_STATUSES_KEY,
    () => requestDaemon("issue.listColumns", { field: "status" }),
    { dedupingInterval: 0 },
  );
  useIssueStatusRevalidation(() => void query.mutate());
  return query;
}

export const issueStatusApi = {
  create: (category: IssueStatusCategory, title: string) =>
    requestDaemon("issue.createColumn", { field: "status", category, title }),
  rename: (id: string, title: string) =>
    requestDaemon("issue.updateColumn", { field: "status", id, title }),
  setCategory: (id: string, category: IssueStatusCategory) =>
    requestDaemon("issue.updateColumn", { field: "status", id, category }),
  move: (statuses: readonly ViewColumnRecord[], id: string, index: number) =>
    requestDaemon("issue.moveColumn", {
      field: "status",
      id,
      sortOrder: sortOrderForColumnPosition(statuses, id, index),
    }),
  remove: (id: string) =>
    requestDaemon("issue.deleteColumn", { field: "status", id }),
};
