import type { SavedHost } from "@cocurdex/client-runtime";
import { hostConnection } from "@/connection";
import { type IssuePatch, patchedIssue } from "./issue-patch";
import { useIssueDetail, useIssueView } from "./issue-queries";

export function useIssueUpdate(host: SavedHost, issueId: string) {
  const detail = useIssueDetail(host.hostId, issueId);
  const view = useIssueView(host.hostId, { cached: true });

  return async (patch: IssuePatch, expectedRevision?: number) => {
    const current = detail.data;
    const viewData = view.data;
    if (!current || !viewData) throw new Error("Issue is not loaded");
    const request = hostConnection(host.hostId).request("issue.update", {
      viewId: viewData.view.id,
      id: issueId,
      ...patch,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
    void view
      .mutate(
        request.then(() => undefined),
        {
          optimisticData: {
            ...viewData,
            issues: viewData.issues.map((issue) =>
              issue.id === issueId
                ? patchedIssue(issue, patch, viewData.statusOptions)
                : issue,
            ),
          },
          populateCache: false,
          revalidate: true,
          rollbackOnError: true,
        },
      )
      .catch(() => undefined);
    await detail.mutate(
      request.then((issue) => ({ ...current, issue })),
      {
        optimisticData: {
          ...current,
          issue: patchedIssue(current.issue, patch, viewData.statusOptions),
        },
        revalidate: false,
        rollbackOnError: true,
      },
    );
  };
}
