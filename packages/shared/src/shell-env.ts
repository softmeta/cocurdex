import { execFile, execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const ENV_MARKER = "__COCURDEX_ENV__";
export const SHELL_ENV_TIMEOUT_MS = 15_000;
const SHELL_ENV_MAX_BUFFER = 8 * 1024 * 1024;

const AGENT_ENV_PREFIXES = [
  "COCURDEX_",
  "PI_",
  "GEMINI_",
  "AGY_",
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

const SHELL_STARTUP_FILES = [
  ".zshenv",
  ".zprofile",
  ".zshrc",
  ".zlogin",
  ".bashrc",
  ".bash_profile",
  ".profile",
  ".config/fish/config.fish",
];

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

export interface ResolveShellEnvOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface ApplyShellEnvOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  resolveEnv: () => Record<string, string> | null;
  isAllowed?: (name: string) => boolean;
}

export interface ApplyShellEnvAsyncOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  resolveEnv?: () => Promise<Record<string, string> | null>;
  isAllowed?: (name: string) => boolean;
}

export function parseShellEnv(
  stdout: string,
  marker: string = ENV_MARKER,
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

export function resolveLoginShell(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (platform === "win32") {
    return null;
  }
  if (env.SHELL) {
    return env.SHELL;
  }
  return platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

function shellEnvCommandArgs(): [string, string] {
  return ["-lic", `echo ${ENV_MARKER}; env; echo ${ENV_MARKER}`];
}

export function resolveShellEnv(
  options: ResolveShellEnvOptions = {},
): Record<string, string> | null {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const shell = resolveLoginShell(platform, env);
  if (!shell) {
    return null;
  }

  try {
    const stdout = execFileSync(shell, shellEnvCommandArgs(), {
      encoding: "utf8",
      timeout: options.timeoutMs ?? SHELL_ENV_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      maxBuffer: SHELL_ENV_MAX_BUFFER,
    });
    return parseShellEnv(stdout, ENV_MARKER);
  } catch {
    return null;
  }
}

export function resolveShellEnvAsync(
  options: ResolveShellEnvOptions = {},
): Promise<Record<string, string> | null> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const shell = resolveLoginShell(platform, env);
  if (!shell) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const child = execFile(
      shell,
      shellEnvCommandArgs(),
      {
        encoding: "utf8",
        timeout: options.timeoutMs ?? SHELL_ENV_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: SHELL_ENV_MAX_BUFFER,
      },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(parseShellEnv(stdout, ENV_MARKER));
      },
    );
    child.stdin?.end();
  });
}

function applyResolvedShellEnv(
  env: NodeJS.ProcessEnv,
  resolved: Record<string, string>,
  isAllowed: (name: string) => boolean,
): boolean {
  let changed = false;

  if (resolved.PATH) {
    const nextPath = mergeEnvPath(env.PATH ?? "", resolved.PATH);
    if (nextPath !== env.PATH) {
      env.PATH = nextPath;
      changed = true;
    }
  }

  for (const [name, value] of Object.entries(resolved)) {
    if (name === "PATH") {
      continue;
    }
    if (env[name] !== undefined) {
      continue;
    }
    if (!isAllowed(name)) {
      continue;
    }
    env[name] = value;
    changed = true;
  }

  return changed;
}

export function applyShellEnv(options: ApplyShellEnvOptions): boolean {
  if (options.platform === "win32") {
    return false;
  }

  const resolved = options.resolveEnv();
  if (!resolved) {
    return false;
  }

  return applyResolvedShellEnv(
    options.env,
    resolved,
    options.isAllowed ?? isAgentEnvKey,
  );
}

export async function applyShellEnvAsync(
  options: ApplyShellEnvAsyncOptions,
): Promise<{ resolved: boolean; changed: boolean }> {
  if (options.platform === "win32") {
    return { resolved: true, changed: false };
  }

  const resolveEnv =
    options.resolveEnv ??
    (() =>
      resolveShellEnvAsync({
        platform: options.platform,
        env: options.env,
      }));
  const resolved = await resolveEnv();
  if (!resolved) {
    return { resolved: false, changed: false };
  }

  return {
    resolved: true,
    changed: applyResolvedShellEnv(
      options.env,
      resolved,
      options.isAllowed ?? isAgentEnvKey,
    ),
  };
}

export async function readShellStartupSignature(
  homeDir: string = os.homedir(),
): Promise<string> {
  const mtimes = await Promise.all(
    SHELL_STARTUP_FILES.map(async (relativePath) => {
      try {
        const info = await stat(path.join(homeDir, relativePath));
        return `${relativePath}:${Math.trunc(info.mtimeMs)}`;
      } catch {
        return `${relativePath}:0`;
      }
    }),
  );
  return mtimes.join("|");
}
