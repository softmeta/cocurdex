import type { WorkspaceRecord } from "@cocurdex/shared";

export interface WorkspaceRepository {
  list(): Promise<WorkspaceRecord[]>;
  upsert(workspace: WorkspaceRecord): Promise<void>;
  delete(workspaceId: string): Promise<void>;
}
