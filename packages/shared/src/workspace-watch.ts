export interface WorkspaceFilesChangedDaemonEvent {
  type: "workspace.filesChanged";
  rootPath: string;
}

export interface WorkspaceGitStateChangedDaemonEvent {
  type: "workspace.gitStateChanged";
  rootPath: string;
}

export type WorkspaceWatchDaemonEvent =
  | WorkspaceFilesChangedDaemonEvent
  | WorkspaceGitStateChangedDaemonEvent;

export function isWorkspaceWatchDaemonEvent(event: {
  type: string;
}): event is WorkspaceWatchDaemonEvent {
  return (
    event.type === "workspace.filesChanged" ||
    event.type === "workspace.gitStateChanged"
  );
}
