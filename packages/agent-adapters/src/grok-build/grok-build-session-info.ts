import type { AcpContextUsage } from "../acp/acp-event-mapper";

export const GROK_SESSION_INFO_REQUEST_METHOD = "x.ai/session/info";

export function buildGrokSessionInfoParams(providerSessionId: string) {
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
