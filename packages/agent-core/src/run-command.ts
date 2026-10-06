import crossSpawn from "cross-spawn";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

const MAX_OUTPUT_LENGTH = 8 * 1024 * 1024;

export function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (error: Error | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          settle(
            new Error(`${command} timed out after ${options.timeoutMs}ms`),
          );
        }, options.timeoutMs)
      : undefined;

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-MAX_OUTPUT_LENGTH);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_OUTPUT_LENGTH);
    });
    child.once("error", (error) => settle(error));
    child.once("close", (code, signal) => {
      if (code === 0) {
        settle(null);
        return;
      }
      settle(
        new Error(
          `${command} exited with ${signal ?? code ?? "unknown"}: ${stderr.trim()}`,
        ),
      );
    });
  });
}
