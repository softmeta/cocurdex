import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";

type DaemonDiagnosticLevel = "debug" | "info" | "warn";

function isDaemonDiagnosticsEnabled() {
  return process.env.COCURDEX_DIAGNOSTICS === "1";
}

export function logDaemonDiagnostic(
  level: DaemonDiagnosticLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  if (!isDaemonDiagnosticsEnabled()) {
    return;
  }

  let payload: string;
  try {
    payload = JSON.stringify({
      details,
      event: message,
      level,
    });
  } catch {
    payload = JSON.stringify({
      event: message,
      level,
      details: "[unserializable]",
    });
  }

  console[level](`${COCURDEX_DAEMON_DIAGNOSTIC_PREFIX}${payload}`);
}
