import type { MessageRecord } from "@cocurdex/shared";

export function requiresNativeSessionRecovery(history: MessageRecord[]) {
  return history.length > 1;
}

export function createNativeSessionRecoveryError(agentLabel: string) {
  return new Error(
    `${agentLabel} could not restore its native session. Cocurdex stopped before sending the prompt to avoid replaying history and consuming unexpected tokens.`,
  );
}
