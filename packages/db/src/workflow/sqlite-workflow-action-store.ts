import type { DatabaseSync } from "node:sqlite";
import type { WorkflowActionRecord } from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import { mapWorkflowAction } from "./sqlite-workflow-mappers";
import type {
  ClaimWorkflowActionInput,
  RenewWorkflowActionLeaseInput,
  SettleWorkflowActionInput,
} from "./workflow-repository";

function runTransaction<T>(database: DatabaseSync, fn: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function readAction(
  database: DatabaseSync,
  actionId: string,
): WorkflowActionRecord | null {
  const row = database
    .prepare("SELECT * FROM workflow_actions WHERE id = ?")
    .get(actionId) as SqliteRow | undefined;
  return row ? mapWorkflowAction(row) : null;
}

export function claimWorkflowAction(
  database: DatabaseSync,
  input: ClaimWorkflowActionInput,
): WorkflowActionRecord | null {
  return runTransaction(database, () => {
    const row = database
      .prepare(
        `SELECT * FROM workflow_actions
         WHERE (status = 'pending' AND available_at <= ?)
            OR (status = 'claimed' AND lease_expires_at <= ?)
         ORDER BY created_at, id
         LIMIT 1`,
      )
      .get(input.now, input.now) as SqliteRow | undefined;
    if (!row) return null;
    const actionId = String(row.id);
    database
      .prepare(
        `UPDATE workflow_actions
         SET status = 'claimed', attempt_count = attempt_count + 1,
             lease_owner = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.workerId, input.leaseExpiresAt, input.now, actionId);
    return readAction(database, actionId);
  });
}

export function renewWorkflowActionLease(
  database: DatabaseSync,
  input: RenewWorkflowActionLeaseInput,
): WorkflowActionRecord | null {
  const update = database
    .prepare(
      `UPDATE workflow_actions
       SET lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND status = 'claimed' AND lease_owner = ?`,
    )
    .run(input.leaseExpiresAt, input.now, input.actionId, input.workerId);
  return Number(update.changes) === 1
    ? readAction(database, input.actionId)
    : null;
}

export function settleWorkflowAction(
  database: DatabaseSync,
  input: SettleWorkflowActionInput,
  writeAggregate: () => void,
): WorkflowActionRecord | null {
  return runTransaction(database, () => {
    const owned = database
      .prepare(
        `SELECT id FROM workflow_actions
         WHERE id = ? AND status = 'claimed' AND lease_owner = ?`,
      )
      .get(input.actionId, input.workerId);
    if (!owned) return null;

    writeAggregate();
    const update = database
      .prepare(
        `UPDATE workflow_actions
         SET status = ?, result_json = ?, error = ?, lease_owner = NULL,
             lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND status = 'claimed' AND lease_owner = ?`,
      )
      .run(
        input.status,
        input.result === undefined ? null : JSON.stringify(input.result),
        input.error ?? null,
        input.settledAt,
        input.actionId,
        input.workerId,
      );
    return Number(update.changes) === 1
      ? readAction(database, input.actionId)
      : null;
  });
}
