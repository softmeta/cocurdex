import {
  type IssueRecord,
  sortIssueColumns,
  type ViewColumnRecord,
} from "@cocurdex/shared";

export function groupIssuesByColumn(
  columns: readonly ViewColumnRecord[],
  issues: readonly IssueRecord[],
): Map<string, IssueRecord[]> {
  const groups = new Map<string, IssueRecord[]>(
    columns.map((column) => [column.id, []]),
  );
  for (const issue of issues) {
    for (const columnId of issue.columnIds) {
      groups.get(columnId)?.push(issue);
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return groups;
}

export function partitionEmptyColumns(
  columns: readonly ViewColumnRecord[],
  groups: ReadonlyMap<string, readonly IssueRecord[]>,
  showEmpty: boolean,
): { visible: ViewColumnRecord[]; hidden: ViewColumnRecord[] } {
  if (showEmpty) return { visible: [...columns], hidden: [] };
  const visible: ViewColumnRecord[] = [];
  const hidden: ViewColumnRecord[] = [];
  for (const column of columns) {
    const target = (groups.get(column.id)?.length ?? 0) > 0 ? visible : hidden;
    target.push(column);
  }
  return { visible, hidden };
}

export function orderedIssueIds(
  columns: readonly ViewColumnRecord[],
  issues: readonly IssueRecord[],
): string[] {
  const groups = groupIssuesByColumn(sortIssueColumns(columns), issues);
  const ids = new Set<string>();
  for (const group of groups.values()) {
    for (const issue of group) ids.add(issue.id);
  }
  return [...ids];
}

export interface IssueStep {
  position: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

export function issueStep(
  orderedIds: readonly string[],
  issueId: string,
): IssueStep | null {
  const index = orderedIds.indexOf(issueId);
  if (index < 0) return null;
  return {
    position: index + 1,
    total: orderedIds.length,
    previousId: orderedIds[index - 1] ?? null,
    nextId: orderedIds[index + 1] ?? null,
  };
}
