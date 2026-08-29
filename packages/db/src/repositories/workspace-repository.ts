import type { WorkspaceRecord } from "@cocurdex/shared";

export interface WorkspaceRepository {
  list(): Promise<WorkspaceRecord[]>;
  upsert(workspace: WorkspaceRecord): Promise<void>;
  // Hard-delete the workspace row and cascade-purge every session (with all
  // dependents) that belonged to it. Intended for "remove from app" — the
  // underlying directory on disk is untouched.
  delete(workspaceId: string): Promise<void>;
}
