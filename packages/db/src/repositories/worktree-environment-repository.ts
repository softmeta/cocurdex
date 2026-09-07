import type { WorkspaceWorktreeEnvironment } from "@cocurdex/shared";

export interface WorktreeEnvironmentRepository {
  getByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment | null>;
  upsert(environment: WorkspaceWorktreeEnvironment): Promise<void>;
}
