export function isMainDiagnosticsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.COCURDEX_DIAGNOSTICS === "1";
}
