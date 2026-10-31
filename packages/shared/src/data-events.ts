import type { AgentEvent } from "./contracts";
import type { PeerMessageEvent } from "./peer-messaging";
import type { ScriptRunChangedEvent } from "./script-run";
import type { TeamChangedEvent } from "./team";
import type { TerminalDaemonEvent } from "./terminal";
import type { WorkspaceSearchDaemonEvent } from "./workspace-search";
import type { WorkspaceWatchDaemonEvent } from "./workspace-watch";

// `agent` marks agent/session runtime state (sessions, pending interactions,
// transcripts) as unsynchronized; emitted synthetically on event-replay gaps
// so clients resync from authoritative snapshots.
export const cocurdexDataAreas = [
  "notes",
  "decks",
  "issues",
  "links",
  "agent",
  "workspace",
  "settings",
  "memory",
] as const;

export type CocurdexDataArea = (typeof cocurdexDataAreas)[number];

export interface CocurdexDataChangedEvent {
  type: "data.changed";
  areas: CocurdexDataArea[];
}

// Journal position of a delivered daemon event. Clients compare it against a
// snapshot's eventSeq boundary to decide whether a buffered event is already
// covered by a refetched snapshot or must be applied on top of it.
export interface DaemonEventMeta {
  seq: number | null;
  epoch: string | null;
}

export type CocurdexDaemonEvent =
  | AgentEvent
  | CocurdexDataChangedEvent
  | PeerMessageEvent
  | ScriptRunChangedEvent
  | TeamChangedEvent
  | TerminalDaemonEvent
  | WorkspaceSearchDaemonEvent
  | WorkspaceWatchDaemonEvent;

type NonAgentDaemonEvent = Exclude<CocurdexDaemonEvent, AgentEvent>;

const nonAgentDaemonEventTypes: Record<NonAgentDaemonEvent["type"], true> = {
  "data.changed": true,
  "peer.message": true,
  "scriptRun.changed": true,
  "team.changed": true,
  "search.result": true,
  "search.done": true,
  "search.error": true,
  "terminal.data": true,
  "terminal.exit": true,
  "terminal.activity": true,
  "workspace.filesChanged": true,
  "workspace.gitStateChanged": true,
};

export function isAgentEvent(event: CocurdexDaemonEvent): event is AgentEvent {
  return !Object.hasOwn(nonAgentDaemonEventTypes, event.type);
}
