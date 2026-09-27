import type { DatabaseSync } from "node:sqlite";
import type {
  WorkspaceWorktreeEnvironment,
  WorktreeEnvironmentProposal,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import { toNullableString } from "../sqlite-types";
import type { WorktreeEnvironmentRepository } from "./worktree-environment-repository";

function mapWorktreeEnvironment(row: SqliteRow): WorkspaceWorktreeEnvironment {
  const proposedAt = toNullableString(row.proposed_at);
  return {
    workspaceId: String(row.workspace_id),
    setupScript: String(row.setup_script ?? ""),
    cleanupScript: String(row.cleanup_script ?? ""),
    updatedAt: toNullableString(row.updated_at),
    proposal: proposedAt
      ? {
          setupScript: String(row.proposed_setup_script ?? ""),
          cleanupScript: String(row.proposed_cleanup_script ?? ""),
          rationale: toNullableString(row.proposed_rationale),
          proposedAt,
        }
      : null,
  };
}

export function createSqliteWorktreeEnvironmentRepository(
  database: DatabaseSync,
): WorktreeEnvironmentRepository {
  return {
    async getByWorkspaceId(workspaceId) {
      const row = database
        .prepare(
          `SELECT * FROM workspace_worktree_environments WHERE workspace_id = ?`,
        )
        .get(workspaceId) as SqliteRow | undefined;
      return row ? mapWorktreeEnvironment(row) : null;
    },
    async upsert(environment) {
      database
        .prepare(
          `INSERT INTO workspace_worktree_environments (
             workspace_id, setup_script, cleanup_script, updated_at,
             proposed_setup_script, proposed_cleanup_script,
             proposed_rationale, proposed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             setup_script = excluded.setup_script,
             cleanup_script = excluded.cleanup_script,
             updated_at = excluded.updated_at,
             proposed_setup_script = excluded.proposed_setup_script,
             proposed_cleanup_script = excluded.proposed_cleanup_script,
             proposed_rationale = excluded.proposed_rationale,
             proposed_at = excluded.proposed_at`,
        )
        .run(
          environment.workspaceId,
          environment.setupScript,
          environment.cleanupScript,
          environment.updatedAt ?? new Date().toISOString(),
          environment.proposal?.setupScript ?? null,
          environment.proposal?.cleanupScript ?? null,
          environment.proposal?.rationale ?? null,
          environment.proposal?.proposedAt ?? null,
        );
    },
    async saveProposal(workspaceId, proposal: WorktreeEnvironmentProposal) {
      database
        .prepare(
          `INSERT INTO workspace_worktree_environments (
             workspace_id, updated_at,
             proposed_setup_script, proposed_cleanup_script,
             proposed_rationale, proposed_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET
             proposed_setup_script = excluded.proposed_setup_script,
             proposed_cleanup_script = excluded.proposed_cleanup_script,
             proposed_rationale = excluded.proposed_rationale,
             proposed_at = excluded.proposed_at`,
        )
        .run(
          workspaceId,
          proposal.proposedAt,
          proposal.setupScript,
          proposal.cleanupScript,
          proposal.rationale,
          proposal.proposedAt,
        );
    },
  };
}
