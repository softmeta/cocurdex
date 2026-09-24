import type {
  WorkspaceWorktreeEnvironment,
  WorktreeEnvironmentProposal,
} from "@cocurdex/shared";

export interface WorktreeEnvironmentRepository {
  getByWorkspaceId(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment | null>;
  upsert(environment: WorkspaceWorktreeEnvironment): Promise<void>;
  saveProposal(
    workspaceId: string,
    proposal: WorktreeEnvironmentProposal,
  ): Promise<void>;
}
