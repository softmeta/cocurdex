import { execFile } from "node:child_process";

export function terminateProcessTree(pid: number) {
  if (process.platform === "win32") {
    return new Promise<void>((resolve) => {
      execFile(
        "taskkill",
        ["/pid", String(pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve(),
      );
    });
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") {
      throw error;
    }
  }
  return Promise.resolve();
}
