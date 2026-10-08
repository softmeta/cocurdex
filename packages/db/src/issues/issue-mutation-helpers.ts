import type { DatabaseSync } from "node:sqlite";
import type { ViewGroupBy } from "@cocurdex/shared";
import { type ColumnRow, listColumns } from "./issue-storage";

export function assertRevision(
  current: { revision: number },
  expectedRevision: number | undefined,
  conflict: Error,
): void {
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw conflict;
  }
}

export function requireColumn(
  database: DatabaseSync,
  field: ViewGroupBy,
  columnId: string,
): ColumnRow {
  const columns = listColumns(database, field);
  const column = columns.find((candidate) => candidate.id === columnId);
  if (!column) {
    const validIds = columns.map((candidate) => candidate.id).join(", ");
    throw new Error(
      `Issue ${field} column not found: ${columnId} (valid: ${validIds})`,
    );
  }
  return column;
}

export function assertFieldValue(
  database: DatabaseSync,
  field: ViewGroupBy,
  value: string | undefined,
): void {
  if (value !== undefined) {
    requireColumn(database, field, value);
  }
}

export function withIssueMutation<T>(
  database: DatabaseSync,
  mutation: () => T,
): T {
  database.exec("SAVEPOINT issue_mutation");
  try {
    const result = mutation();
    database.exec("RELEASE SAVEPOINT issue_mutation");
    return result;
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT issue_mutation");
    database.exec("RELEASE SAVEPOINT issue_mutation");
    throw error;
  }
}
