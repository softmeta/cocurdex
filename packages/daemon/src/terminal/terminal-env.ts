const DAEMON_ONLY_KEYS = new Set([
  "COCURDEX_WEB_ROOT",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ELECTRON_RUN_AS_NODE",
]);

function isDaemonOnlyKey(key: string) {
  return DAEMON_ONLY_KEYS.has(key) || key.startsWith("COCURDEX_DAEMON_");
}

export function buildTerminalEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !isDaemonOnlyKey(key)) {
      result[key] = value;
    }
  }
  result.TERM ??= "xterm-256color";
  result.COLORTERM ??= "truecolor";
  result.LANG ??= "en_US.UTF-8";
  return result;
}
