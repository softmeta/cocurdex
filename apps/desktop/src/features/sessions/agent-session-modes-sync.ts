import type { AgentEvent, AgentSessionMode } from "@cocurdex/shared";
import { atom } from "jotai";
import {
  agentsAtom,
  applyAgentSessionModesAtom,
  sessionsAtom,
} from "./session-store";

function sameModeIds(left: AgentSessionMode[], right: AgentSessionMode[]) {
  return (
    left.length === right.length &&
    left.every((mode, index) => mode.id === right[index]?.id)
  );
}

export const applyRuntimeSessionModesAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (event.type !== "session.mode.updated" || !event.availableModes) {
      return;
    }
    const session = get(sessionsAtom).find(
      (item) => item.id === event.sessionId,
    );
    const agent = get(agentsAtom).find(
      (item) => item.id === session?.agentType,
    );
    if (
      agent?.capabilities.transport !== "acp" ||
      sameModeIds(agent.capabilities.sessionModes, event.availableModes)
    ) {
      return;
    }
    set(applyAgentSessionModesAtom, {
      agentId: agent.id,
      sessionModes: event.availableModes,
    });
  },
);
