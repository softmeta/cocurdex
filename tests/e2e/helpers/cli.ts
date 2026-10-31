import { spawn } from "node:child_process";
import path from "node:path";
import { killProcessTree } from "@cocurdex/agent-adapters";
import { repoRoot } from "@cocurdex/test-harness/helpers/daemon-process";

const cliPackageDir = path.join(repoRoot, "apps", "cli");
const cliBinPath = path.join(cliPackageDir, "bin", "cocurdex.mjs");

const CLI_TIMEOUT_MS = 30_000;

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export async function runCli(
  args: string[],
  options: RunCliOptions,
): Promise<CliResult> {
  const child = spawn(process.execPath, [cliBinPath, ...args], {
    cwd: cliPackageDir,
    env: {
      ...process.env,
      ...options.env,
      COCURDEX_USER_DATA_PATH: options.userDataPath,
      COCURDEX_DISABLE_MEMORY_AUTO_START: "1",
      NO_COLOR: "1",
      TZ: "UTC",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(options.input);
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exited = new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("exit", (code) => resolve(code));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const code = await Promise.race([
    exited,
    new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), CLI_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  if (code === "timeout") {
    if (child.pid) await killProcessTree(child.pid);
    await exited;
    throw new Error(`cocurdex ${args.join(" ")} timed out`);
  }
  return {
    code,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
  };
}
