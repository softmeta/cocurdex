import type { SpawnOptions } from "node:child_process";
import { spawnCommand } from "@cocurdex/agent-adapters";

export interface CommandOptions extends SpawnOptions {
  inherit?: boolean;
}

export function runCommand(
  command: string,
  args: readonly string[],
  { inherit = false, ...options }: CommandOptions = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawnCommand(command, args, {
      ...options,
      stdio: inherit ? ["ignore", "inherit", "inherit"] : "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      if (code === 0) {
        resolve(output);
        return;
      }
      const message = Buffer.concat(stderr).toString("utf8") || output;
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${code}\n${message}`,
        ),
      );
    });
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  what: string,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(rethrowFatal)) return;
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

export class FatalWaitError extends Error {}

function rethrowFatal(error: unknown): false {
  if (error instanceof FatalWaitError) throw error;
  return false;
}
