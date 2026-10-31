import type {
  SessionObservationSnapshot,
  WorkspaceRecord,
} from "@cocurdex/shared";

export function sessionWorkspace(
  observation: SessionObservationSnapshot | null,
  workspaces: readonly WorkspaceRecord[],
) {
  const workspaceId = observation?.session.workspaceId;
  return workspaces.find((entry) => entry.id === workspaceId) ?? null;
}

export function sessionWorkspacePath(
  observation: SessionObservationSnapshot | null,
  workspace: WorkspaceRecord | null,
) {
  return observation?.session.worktreePath ?? workspace?.rootPaths[0] ?? null;
}
