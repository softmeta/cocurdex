import type {
  IssueFieldOption,
  IssueRecord,
  IssueStatusCategory,
  ViewFull,
} from "@cocurdex/shared";
import { type IssueFilters, issueMatchesFilters } from "./issue-filters";

export interface IssueSection {
  status: IssueFieldOption;
  issues: IssueRecord[];
}

const CATEGORY_ORDER: Record<IssueStatusCategory, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  completed: 3,
  canceled: 4,
};
const UNCATEGORIZED_ORDER = 5;

function categoryOrder(category: IssueStatusCategory | null) {
  return category ? CATEGORY_ORDER[category] : UNCATEGORIZED_ORDER;
}

function matches(issue: IssueRecord, needle: string) {
  if (!needle) return true;
  return (
    issue.title.toLocaleLowerCase().includes(needle) ||
    issue.identifier.toLocaleLowerCase().includes(needle)
  );
}

export function issueSections(
  issues: readonly IssueRecord[],
  statusOptions: readonly IssueFieldOption[],
  filters: IssueFilters,
  query: string,
): IssueSection[] {
  const needle = query.trim().toLocaleLowerCase();
  const shown = issues.filter(
    (issue) => issueMatchesFilters(issue, filters) && matches(issue, needle),
  );
  return statusOptions
    .map((status, order) => ({ status, order }))
    .sort(
      (left, right) =>
        categoryOrder(left.status.category) -
          categoryOrder(right.status.category) || left.order - right.order,
    )
    .map(({ status }) => ({
      status,
      issues: shown
        .filter((issue) => issue.status === status.id)
        .sort((left, right) => left.sortOrder - right.sortOrder),
    }))
    .filter((section) => section.issues.length > 0);
}

export function withIssueStatus(
  view: ViewFull,
  issueId: string,
  statusId: string,
): ViewFull {
  const status = view.statusOptions.find((option) => option.id === statusId);
  if (!status) return view;
  return {
    ...view,
    issues: view.issues.map((issue) =>
      issue.id === issueId
        ? { ...issue, status: status.id, statusCategory: status.category }
        : issue,
    ),
  };
}
