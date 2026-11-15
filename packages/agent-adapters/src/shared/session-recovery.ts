import type { MessageRecord } from "@cocurdex/shared";
import { ReasonError } from "@cocurdex/shared";

export function requiresNativeSessionRecovery(history: MessageRecord[]) {
  return history.some((message) => message.role === "assistant");
}

export function createNativeSessionRecoveryError(agentLabel: string) {
  return new ReasonError(
    "session.nativeRestoreFailed",
    `${agentLabel} could not restore its native session. Cocurdex stopped before sending the prompt to avoid replaying history and consuming unexpected tokens.`,
  );
}
