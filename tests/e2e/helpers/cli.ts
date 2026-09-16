import { spawn } from "node:child_process";
import path from "node:path";
import { repoRoot, sleep } from "./daemon-process";

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
      NO_COLOR: "1",
      TZ: "UTC",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exited = new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("exit", (code) => resolve(code));
  });
  const code = await Promise.race([
    exited,
    sleep(CLI_TIMEOUT_MS).then(() => "timeout" as const),
  ]);
  if (code === "timeout") {
    child.kill("SIGKILL");
    await exited;
    throw new Error(`cocurdex ${args.join(" ")} timed out`);
  }
  return {
    code,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
  };
}
