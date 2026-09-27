export const ASSISTANT_SESSION_ID_PREFIX = "assistant-";

export function newAssistantSessionId() {
  return `${ASSISTANT_SESSION_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isAssistantSessionId(sessionId: string) {
  return sessionId.startsWith(ASSISTANT_SESSION_ID_PREFIX);
}
