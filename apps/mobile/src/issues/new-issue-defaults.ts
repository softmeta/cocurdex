import type { IssueFieldOption } from "@cocurdex/shared";

export function defaultIssueStatus(options: readonly IssueFieldOption[]) {
  return (
    options.find((option) => option.category === "backlog") ??
    options.find((option) => option.category === "unstarted") ??
    options[0] ??
    null
  )?.id;
}

export function defaultIssuePriority(options: readonly IssueFieldOption[]) {
  return (options.find((option) => option.id === "none") ?? options.at(-1))?.id;
}
