import path from "node:path";
import { HEADLESS_DAEMON_ENTRY } from "@cocurdex/daemon/background-launch";

export const WINDOWS_DAEMON_EXECUTABLE = "cocurdex-daemon.exe";

interface HeadlessDaemonSource {
  cliDir: string;
  execPath: string;
  platform: NodeJS.Platform;
  exists(filePath: string): boolean;
}

export function headlessDaemonCommand({
  cliDir,
  execPath,
  platform,
  exists,
}: HeadlessDaemonSource): string[] | null {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const entry = pathApi.join(cliDir, HEADLESS_DAEMON_ENTRY);
  if (!exists(entry)) return null;
  const windowless = pathApi.join(
    pathApi.dirname(execPath),
    WINDOWS_DAEMON_EXECUTABLE,
  );
  const runtime =
    platform === "win32" && exists(windowless) ? windowless : execPath;
  return [runtime, entry];
}
