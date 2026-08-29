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
  if (!enabled) {
    return;
  }

  console[level](message, details);
}
