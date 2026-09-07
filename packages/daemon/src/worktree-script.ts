import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export async function runWorktreeLifecycleScript(input: {
  script: string;
  cwd: string;
  timeoutMs?: number;
}): Promise<void> {
  const script = input.script.trim();
  if (!script) {
    return;
  }

  const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "cmd.exe";
    await execFileAsync(shell, ["/d", "/s", "/c", script], {
      cwd: input.cwd,
      timeout,
      windowsHide: true,
    });
    return;
  }

  const shell = process.env.SHELL || "/bin/zsh";
  await execFileAsync(shell, ["-lc", script], {
    cwd: input.cwd,
    timeout,
  });
}
