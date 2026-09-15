export interface WorkspaceSearchStartPayload {
  searchId: string;
  rootPath: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  maxResults: number;
  // Comma-separated glob patterns. Empty string means no filter.
  include: string;
  exclude: string;
}

export interface WorkspaceSearchMatchRange {
  startColumn: number;
  endColumn: number;
}

export interface WorkspaceSearchMatch {
  filePath: string;
  line: number;
  text: string;
  ranges: WorkspaceSearchMatchRange[];
}

export interface WorkspaceSearchResultEvent {
  searchId: string;
  batch: WorkspaceSearchMatch[];
}

export interface WorkspaceSearchDoneEvent {
  searchId: string;
  reason: "completed" | "cancelled" | "empty-query" | "limit-reached";
}

export interface WorkspaceSearchErrorEvent {
  searchId: string;
  message: string;
}

export interface WorkspaceSearchResultDaemonEvent
  extends WorkspaceSearchResultEvent {
  type: "search.result";
}

export interface WorkspaceSearchDoneDaemonEvent
  extends WorkspaceSearchDoneEvent {
  type: "search.done";
}

export interface WorkspaceSearchErrorDaemonEvent
  extends WorkspaceSearchErrorEvent {
  type: "search.error";
}

export type WorkspaceSearchDaemonEvent =
  | WorkspaceSearchResultDaemonEvent
  | WorkspaceSearchDoneDaemonEvent
  | WorkspaceSearchErrorDaemonEvent;

export function isWorkspaceSearchDaemonEvent(event: {
  type: string;
}): event is WorkspaceSearchDaemonEvent {
  return (
    event.type === "search.result" ||
    event.type === "search.done" ||
    event.type === "search.error"
  );
}
