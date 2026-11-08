import { execFileSync } from "node:child_process";

const ENV_MARKER = "__COCURDEX_ENV__";

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
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    return parseShellEnv(stdout, ENV_MARKER);
  } catch {
    return null;
  }
}

export function applyShellEnv(options: ApplyShellEnvOptions): void {
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
