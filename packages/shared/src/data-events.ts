import type { ChatEvent } from "./chat-events";
import type { AgentEvent } from "./contracts";
import type { PeerMessageEvent } from "./peer-messaging";
import type { WorkspaceSearchDaemonEvent } from "./workspace-search";

// `agent` marks agent/session runtime state (sessions, pending interactions,
// transcripts) as unsynchronized; emitted synthetically on event-replay gaps
// so clients resync from authoritative snapshots.
export const cocurdexDataAreas = ["notes", "issues", "agent"] as const;

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
  | ChatEvent
  | PeerMessageEvent
  | WorkspaceSearchDaemonEvent;
