import type { IssueFieldOption, IssueRecord } from "@cocurdex/shared";

export type IssuePatch = Partial<
  Pick<
    IssueRecord,
    "title" | "description" | "status" | "priority" | "workspaceId" | "labelIds"
  >
>;

export function patchedIssue(
  issue: IssueRecord,
  patch: IssuePatch,
  statusOptions: readonly IssueFieldOption[],
): IssueRecord {
  const status =
    patch.status === undefined
      ? undefined
      : statusOptions.find((option) => option.id === patch.status);
  return {
    ...issue,
    ...patch,
    ...(status ? { statusCategory: status.category } : {}),
  };
}

export function toggledLabelIds(labelIds: readonly string[], id: string) {
  return labelIds.includes(id)
    ? labelIds.filter((labelId) => labelId !== id)
    : [...labelIds, id];
}

export function issueTextPatch(
  issue: Pick<IssueRecord, "title" | "description">,
  title: string,
  description: string,
): IssuePatch {
  const nextTitle = title.trim();
  const nextDescription = description.trim() || null;
  return {
    ...(nextTitle !== issue.title ? { title: nextTitle } : {}),
    ...(nextDescription !== (issue.description?.trim() || null)
      ? { description: nextDescription }
      : {}),
  };
}
