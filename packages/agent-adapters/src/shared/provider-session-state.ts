export const PROVIDER_SESSION_STATE_SCHEMA_VERSION = 1;

export function serializeProviderSessionState(state: Record<string, unknown>) {
  return JSON.stringify({
    ...state,
    schemaVersion: PROVIDER_SESSION_STATE_SCHEMA_VERSION,
  });
}
