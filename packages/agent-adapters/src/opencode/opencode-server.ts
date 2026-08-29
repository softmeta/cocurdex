import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { buildChildProcessEnv } from "../shared/process-env";

const OPEN_CODE_BINARY = "opencode";
const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_START_TIMEOUT_MS = 5_000;
const MAX_SERVER_OUTPUT_LENGTH = 32 * 1024;

export interface OpenCodeExecutableInfo {
  command: string;
  resolvedPath: string | null;
  version: string | null;
  versionError: string | null;
}

export interface OpenCodeProcessLaunchInfo {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  executable: OpenCodeExecutableInfo;
}

export interface OpenCodeServer {
  url: string;
  pid: number | null;
  executable: OpenCodeExecutableInfo;
  close(): void;
}

export interface OpenCodeProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", "pipe", "pipe"];
  windowsHide: boolean;
  shell: boolean;
}

export function getOpenCodeDiagnosticEnvironment(
  environment: NodeJS.ProcessEnv,
): Record<string, string | null> {
  const names = [
    "PATH",
    "HOME",
    "PWD",
    "OPENCODE_DB",
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_DIR",
    "OPENCODE_CONFIG_CONTENT",
    "OPENCODE_CHANNEL",
    "OPENCODE_CLIENT",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
  ];

  return Object.fromEntries(
    names.map((name) => [name, environment[name] ?? null]),
  );
}

function getCommandOutput(result: ReturnType<typeof spawnSync>) {
  return String(result.stdout ?? "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inspectOpenCodeExecutable(
  environment: NodeJS.ProcessEnv,
  cwd: string,
): OpenCodeExecutableInfo {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const lookup = spawnSync(lookupCommand, [OPEN_CODE_BINARY], {
    cwd,
    env: environment,
    encoding: "utf8",
    windowsHide: true,
  });
  const resolvedPath = getCommandOutput(lookup)[0] ?? null;
  const versionResult = spawnSync(OPEN_CODE_BINARY, ["--version"], {
    cwd,
    env: environment,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const version = getCommandOutput(versionResult)[0] ?? null;

  return {
    command: OPEN_CODE_BINARY,
    resolvedPath,
    version,
    versionError: versionResult.error?.message ?? null,
  };
}

/**
 * Keep OpenCode's project discovery anchored to the selected workspace. The
 * SDK's default launcher inherits the daemon cwd and the complete host env,
 * which lets a packaged app accidentally discover unrelated home directories,
 * shell hooks, plugins, or MCP configuration.
 */
export function buildOpenCodeProcessOptions(
  workspaceRootPath: string,
  environment: NodeJS.ProcessEnv = process.env,
): OpenCodeProcessOptions {
  const env = buildChildProcessEnv(environment);
  env.PWD = workspaceRootPath;
  delete env.OLDPWD;
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({});

  const options: OpenCodeProcessOptions = {
    cwd: workspaceRootPath,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: process.platform === "win32",
  };

  return options;
}

function stopOpenCodeProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    const result = spawnSync(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      { windowsHide: true },
    );
    if (!result.error && result.status === 0) {
      return;
    }
  }

  child.kill();
}

function appendServerOutput(current: string, chunk: unknown): string {
  const next = `${current}${String(chunk)}`;
  return next.length > MAX_SERVER_OUTPUT_LENGTH
    ? next.slice(-MAX_SERVER_OUTPUT_LENGTH)
    : next;
}

async function findAvailableLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, DEFAULT_HOSTNAME, () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Failed to allocate a local OpenCode server port"));
      });
    });
  });
}

function waitForOpenCodeServer(
  child: ChildProcess,
  timeoutMs: number,
  onOutput?: (stream: "stderr" | "stdout", output: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;

    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    };

    const handleChunk = (stream: "stderr" | "stdout", chunk: unknown) => {
      const text = String(chunk);
      onOutput?.(stream, text);
      output = appendServerOutput(output, text);
      if (settled) return;

      const match = output.match(
        /opencode server listening\s+on\s+(https?:\/\/[^\s]+)/,
      );
      if (!match) return;

      settled = true;
      clearTimeout(timeoutId);
      resolve(match[1]);
    };

    const timeoutId = setTimeout(() => {
      stopOpenCodeProcess(child);
      finishWithError(
        new Error(
          `Timeout waiting for OpenCode server after ${timeoutMs}ms${
            output.trim() ? `\nServer output: ${output}` : ""
          }`,
        ),
      );
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => handleChunk("stdout", chunk));
    child.stderr?.on("data", (chunk) => handleChunk("stderr", chunk));
    child.once("error", (error) => finishWithError(error));
    child.once("exit", (code) => {
      finishWithError(
        new Error(
          `OpenCode server exited with code ${code}${
            output.trim() ? `\nServer output: ${output}` : ""
          }`,
        ),
      );
    });
  });
}

export async function startOpenCodeServer(options: {
  workspaceRootPath: string;
  hostname?: string;
  port?: number;
  timeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
  onLaunch?: (launch: OpenCodeProcessLaunchInfo) => void;
  onOutput?: (stream: "stderr" | "stdout", output: string) => void;
}): Promise<OpenCodeServer> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME;
  const port = options.port ?? (await findAvailableLocalPort());
  const childOptions = buildOpenCodeProcessOptions(
    options.workspaceRootPath,
    options.environment,
  );
  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`];
  const executable = inspectOpenCodeExecutable(
    childOptions.env,
    childOptions.cwd,
  );
  options.onLaunch?.({
    args,
    cwd: childOptions.cwd,
    env: childOptions.env,
    executable,
  });
  const child = spawn(OPEN_CODE_BINARY, args, childOptions);
  const url = await waitForOpenCodeServer(
    child,
    options.timeoutMs ?? DEFAULT_START_TIMEOUT_MS,
    options.onOutput,
  );

  return {
    url,
    pid: child.pid ?? null,
    executable,
    close() {
      stopOpenCodeProcess(child);
    },
  };
}
