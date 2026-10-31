import type { LogLevel } from "@cocurdex/shared";
import { writeLog } from "@cocurdex/shared/node";

export function logDaemonDiagnostic(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>,
) {
  writeLog(level, "daemon", event, details);
}
