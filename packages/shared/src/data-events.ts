import type { AlertEvent } from "./alert";
import type { AgentEvent } from "./contracts";
import type { PeerMessageEvent } from "./peer-messaging";
import type { ScriptRunChangedEvent } from "./script-run";
import type { TeamChangedEvent } from "./team";
import type { TerminalDaemonEvent } from "./terminal";
import type { WorkspaceSearchDaemonEvent } from "./workspace-search";
import type { WorkspaceWatchDaemonEvent } from "./workspace-watch";

export const cocurdexDataAreas = [
  "notes",
  "decks",
  "issues",
  "links",
  "agent",
  "workspace",
  "settings",
  "memory",
  "personal",
  "routines",
  "applications",
] as const;

export type CocurdexDataArea = (typeof cocurdexDataAreas)[number];

export interface CocurdexDataChangedEvent {
  type: "data.changed";
  areas: CocurdexDataArea[];
}

export interface DaemonEventMeta {
  seq: number | null;
  epoch: string | null;
}

export type CocurdexDaemonEvent =
  | AgentEvent
  | AlertEvent
  | CocurdexDataChangedEvent
  | PeerMessageEvent
  | ScriptRunChangedEvent
  | TeamChangedEvent
  | TerminalDaemonEvent
  | WorkspaceSearchDaemonEvent
  | WorkspaceWatchDaemonEvent;

type NonAgentDaemonEvent = Exclude<CocurdexDaemonEvent, AgentEvent>;

const nonAgentDaemonEventTypes: Record<NonAgentDaemonEvent["type"], true> = {
  alert: true,
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
