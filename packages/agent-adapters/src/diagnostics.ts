import type { LogLevel } from "@cocurdex/shared";
import { writeLog } from "@cocurdex/shared/node";

export function logAdapterDiagnostic(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>,
) {
  writeLog(level, "agent-adapters", event, details);
}
