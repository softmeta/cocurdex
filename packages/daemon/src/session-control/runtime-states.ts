import {
  type AgentSessionRuntimeState,
  applySessionRuntimeEvent,
  EMPTY_AGENT_SESSION_RUNTIME_STATE,
  type SessionRuntimeEvent,
} from "@cocurdex/shared";

export class SessionRuntimeStates {
  private readonly states = new Map<string, AgentSessionRuntimeState>();

  apply(event: SessionRuntimeEvent) {
    this.states.set(
      event.sessionId,
      applySessionRuntimeEvent(this.get(event.sessionId), event),
    );
  }

  get(sessionId: string): AgentSessionRuntimeState {
    return this.states.get(sessionId) ?? EMPTY_AGENT_SESSION_RUNTIME_STATE;
  }

  forget(sessionId: string) {
    this.states.delete(sessionId);
  }
}
