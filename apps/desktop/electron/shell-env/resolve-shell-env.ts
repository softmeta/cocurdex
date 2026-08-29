import { execFileSync } from "node:child_process";

/**
 * macOS/Linux GUI apps launched from Finder/Dock inherit only a stripped
 * environment, not the user's login-shell environment. That breaks two things
 * in packaged builds:
 *
 *  - PATH is minimal (e.g. `/usr/bin:/bin`), so agent detection (`which <cli>`)
 *    and CLI spawns fail.
 *  - Provider auth/proxy vars exported from `~/.zshrc` (e.g. `ANTHROPIC_API_KEY`,
 *    `HTTPS_PROXY`) are absent, so the managed OpenCode server — which inherits
 *    `process.env` directly — never sees them.
 *
 * We run the user's login+interactive shell once at startup (`-lic` sources
 * `.zprofile`/`.zlogin` and `.zshrc`), capture its full environment, then merge
 * the relevant parts into `process.env`.
 */

const ENV_MARKER = "__COCURDEX_ENV__";

/**
 * Keys worth importing from the login shell. We deliberately do NOT import the
 * shell's entire environment: unrelated vars are noise at best and a way to
 * leak unexpected state at worst. Mirrors the agent-adapter env allowlist so
 * agents get exactly the provider/proxy/toolchain vars they legitimately need.
 */
const AGENT_ENV_PREFIXES = [
  "COCURDEX_",
  "PI_",
  "GEMINI_",
  "GOOGLE_",
  "CLAUDE_",
  "ANTHROPIC_",
  "OPENAI_",
  "OPENCODE_",
  "CODEX_",
  "DEEPSEEK_",
  "AWS_",
  "AZURE_",
  "VERTEX_",
  "NODE_",
  "NPM_",
  "CARGO_",
];

const AGENT_ENV_NAMES = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "FTP_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
]);

/**
 * Match the explicit `*_API_KEY` / `*_TOKEN` convention used by most providers
 * without enumerating every provider name.
 */
function isProviderSecretKey(name: string): boolean {
  return name.endsWith("_API_KEY") || name.endsWith("_TOKEN");
}

export function isAgentEnvKey(name: string): boolean {
  if (AGENT_ENV_NAMES.has(name)) {
    return true;
  }
  if (AGENT_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  return isProviderSecretKey(name);
}

export interface ApplyShellEnvOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  resolveEnv: () => Record<string, string> | null;
  isAllowed?: (name: string) => boolean;
}

/**
 * Extract the `env` dump printed between two markers, ignoring any banner/noise
 * a login shell may emit before it, and parse it into key/value pairs. Values
 * are split on the first `=` so tokens containing `=` survive intact.
 */
export function parseShellEnv(
  stdout: string,
  marker: string,
): Record<string, string> | null {
  const start = stdout.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const end = stdout.indexOf(marker, start + marker.length);
  if (end === -1) {
    return null;
  }

  const body = stdout.slice(start + marker.length, end);
  const result: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    result[line.slice(0, eq)] = line.slice(eq + 1);
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Merge a resolved shell PATH ahead of the current PATH, de-duplicating entries
 * while preserving order so user-managed bin directories win lookups.
 */
export function mergeEnvPath(currentPath: string, shellPath: string): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const entry of [...shellPath.split(":"), ...currentPath.split(":")]) {
    if (entry.length === 0 || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    merged.push(entry);
  }

  return merged.join(":");
}

/**
 * Run the user's login+interactive shell to print its full environment. Returns
 * null on any failure so startup never blocks on a misbehaving shell config.
 */
export function resolveShellEnv(): Record<string, string> | null {
  const shell = process.env.SHELL;
  if (!shell) {
    return null;
  }

  try {
    const stdout = execFileSync(
      shell,
      ["-lic", `echo ${ENV_MARKER}; env; echo ${ENV_MARKER}`],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        // A full environment dump can exceed the default 1MB buffer.
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    return parseShellEnv(stdout, ENV_MARKER);
  } catch {
    return null;
  }
}

/**
 * Merge the login-shell environment into `env`:
 *
 *  - PATH is always merged ahead of the existing PATH (user bin dirs win).
 *  - Allowlisted provider/proxy/toolchain vars are filled in only when absent,
 *    so values explicitly set by the host process are never overwritten.
 */
export function applyShellEnv(options: ApplyShellEnvOptions): void {
  // Windows GUI processes inherit the full environment from the registry.
  if (options.platform === "win32") {
    return;
  }

  const resolved = options.resolveEnv();
  if (!resolved) {
    return;
  }

  const isAllowed = options.isAllowed ?? isAgentEnvKey;

  if (resolved.PATH) {
    options.env.PATH = mergeEnvPath(options.env.PATH ?? "", resolved.PATH);
  }

  for (const [name, value] of Object.entries(resolved)) {
    if (name === "PATH") {
      continue;
    }
    if (options.env[name] !== undefined) {
      continue;
    }
    if (!isAllowed(name)) {
      continue;
    }
    options.env[name] = value;
  }
}
