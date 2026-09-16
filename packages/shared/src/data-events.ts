import type { ChatEvent } from "./chat-events";
import type { AgentEvent } from "./contracts";
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

export type CocurdexDaemonEvent =
  | AgentEvent
  | CocurdexDataChangedEvent
  | ChatEvent
  | WorkspaceSearchDaemonEvent;
