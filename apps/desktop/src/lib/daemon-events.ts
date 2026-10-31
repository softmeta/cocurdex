import {
  type AgentEvent,
  type CocurdexDaemonEvent,
  type DaemonEventMeta,
  isAgentEvent,
} from "@cocurdex/shared";
import { onLocalHostEvent } from "./daemon-client";
import type { ProductEventApi } from "./types";

type DaemonEventListener = (
  event: CocurdexDaemonEvent,
  meta: DaemonEventMeta,
) => void;

export function onDaemonEvent(listener: DaemonEventListener): () => void {
  return onLocalHostEvent(listener);
}

export function onDaemonAgentEvent(
  listener: (event: AgentEvent, meta: DaemonEventMeta) => void,
): () => void {
  return onDaemonEvent((event, meta) => {
    if (isAgentEvent(event)) listener(event, meta);
  });
}

function onEventType<T extends CocurdexDaemonEvent["type"], P>(
  type: T,
  select: (event: Extract<CocurdexDaemonEvent, { type: T }>) => P,
) {
  return (listener: (payload: P) => void) =>
    onDaemonEvent((event) => {
      if (event.type === type) {
        listener(select(event as Extract<CocurdexDaemonEvent, { type: T }>));
      }
    });
}

export const daemonEventApi: ProductEventApi = {
  onDataChanged: onEventType("data.changed", (event) => event),
  onWorkspaceFilesChanged: onEventType(
    "workspace.filesChanged",
    ({ rootPath }) => ({ rootPath }),
  ),
  onWorkspaceGitStateChanged: onEventType(
    "workspace.gitStateChanged",
    ({ rootPath }) => ({ rootPath }),
  ),
  onWorkspaceSearchResult: onEventType(
    "search.result",
    ({ batch, searchId }) => ({ batch, searchId }),
  ),
  onWorkspaceSearchDone: onEventType("search.done", ({ reason, searchId }) => ({
    reason,
    searchId,
  })),
  onWorkspaceSearchError: onEventType(
    "search.error",
    ({ message, searchId }) => ({ message, searchId }),
  ),
  onPtyData: onEventType("terminal.data", ({ type: _type, ...event }) => event),
  onPtyExit: onEventType("terminal.exit", ({ type: _type, ...event }) => event),
  onPtyActivity: onEventType(
    "terminal.activity",
    ({ type: _type, ...event }) => event,
  ),
};
