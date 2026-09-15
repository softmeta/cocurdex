import type { ChatEvent } from "./chat-events";
import type { AgentEvent } from "./contracts";
import type { WorkspaceSearchDaemonEvent } from "./workspace-search";

export const cocurdexDataAreas = ["notes", "issues"] as const;

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
