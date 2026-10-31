import {
  LOG_LEVELS,
  type LogLevel,
  type RendererLogPayload,
} from "@cocurdex/shared";
import { sanitizeLogDetails, truncateLogString } from "@cocurdex/shared/node";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && LOG_LEVELS.includes(value as LogLevel);
}

export function sanitizeRendererLogPayload(
  payload: unknown,
): RendererLogPayload {
  if (!isRecord(payload)) {
    return {
      event: "renderer.invalidPayload",
      level: "warn",
      scope: "renderer",
    };
  }

  const level = isLogLevel(payload.level) ? payload.level : "error";
  const scope =
    typeof payload.scope === "string" && payload.scope.trim()
      ? truncateLogString(payload.scope)
      : "renderer";
  const event =
    typeof payload.event === "string" && payload.event.trim()
      ? truncateLogString(payload.event)
      : "renderer.error";

  return {
    details: sanitizeLogDetails(
      payload.details,
    ) as RendererLogPayload["details"],
    event,
    level,
    scope,
  };
}
