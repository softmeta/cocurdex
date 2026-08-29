import type { AcpContextUsage } from "../acp/acp-event-mapper";

// `x.ai/session/info` is a local read: it answers from the resident session's
// chat state (conversation estimate + configured window) without touching the
// model API, so polling it costs no tokens and cannot disturb prompt caching.
export const GROK_SESSION_INFO_REQUEST_METHOD = "x.ai/session/info";

export function buildGrokSessionInfoParams(providerSessionId: string) {
  // Grok falls back to "the first resident session" when `sessionId` is
  // omitted, which reads the wrong meter once a second session is live.
  return { sessionId: providerSessionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

/**
 * Read the context meter out of an `x.ai/session/info` response.
 *
 * The payload is Grok's `ExtMethodResult`: `{ result: { context: { used,
 * total, … } } }`. A session that is no longer resident answers `{}`, and an
 * unknown meter is reported as `0` — both mean "keep the value we already
 * have", so they map to `null` rather than to a zeroed usage record.
 */
export function parseGrokBuildContextUsage(
  value: unknown,
): AcpContextUsage | null {
  if (!isRecord(value)) {
    return null;
  }
  const response = isRecord(value.result) ? value.result : value;
  const context = isRecord(response.context) ? response.context : null;
  if (!context) {
    return null;
  }
  const contextTokensUsed = readPositiveInt(context.used);
  const contextWindowSize = readPositiveInt(context.total);
  if (contextTokensUsed == null && contextWindowSize == null) {
    return null;
  }
  return {
    ...(contextTokensUsed != null ? { contextTokensUsed } : {}),
    ...(contextWindowSize != null ? { contextWindowSize } : {}),
  };
}
