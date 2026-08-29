import type { AgentEvent } from "./contracts";

export type CocurdexDataArea = "notes" | "issues";

export interface CocurdexDataChangedEvent {
  type: "data.changed";
  areas: CocurdexDataArea[];
}

export type CocurdexDaemonEvent = AgentEvent | CocurdexDataChangedEvent;
