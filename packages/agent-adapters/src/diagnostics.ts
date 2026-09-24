import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";

type AdapterDiagnosticLevel = "debug" | "info";

export function isAdapterDiagnosticsEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.COCURDEX_DIAGNOSTICS === "1";
}

export function logAdapterDiagnostic(
  level: AdapterDiagnosticLevel,
  message: string,
  details?: Record<string, unknown>,
  enabled = isAdapterDiagnosticsEnabled(),
) {
  if (level === "debug" && !enabled) {
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
      details: "[unserializable]",
      event: message,
      level,
    });
  }

  console[level](`${COCURDEX_DAEMON_DIAGNOSTIC_PREFIX}${payload}`);
}
