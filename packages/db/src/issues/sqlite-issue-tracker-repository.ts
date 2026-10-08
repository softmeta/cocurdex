import type { DatabaseSync } from "node:sqlite";
import { createIssueCollaborationOperations } from "./issue-collaboration-operations";
import { createIssueOperations } from "./issue-operations";
import { insertDefaultView } from "./issue-storage";
import type { IssueTrackerRepository } from "./issue-tracker-repository";
import { createIssueViewOperations } from "./issue-view-operations";

export function createSqliteIssueTrackerRepository(
  database: DatabaseSync,
): IssueTrackerRepository {
  insertDefaultView(database);
  return {
    ...createIssueViewOperations(database),
    ...createIssueOperations(database),
    ...createIssueCollaborationOperations(database),
  };
}
