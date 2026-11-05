import type { ChildProcess } from "node:child_process";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";

interface KeepAwakeCommand {
  command: string;
  args: string[];
}

const ES_CONTINUOUS_SYSTEM_REQUIRED = "0x80000001";

function windowsKeepAwakeScript(pid: number) {
  return [
    "Add-Type -Namespace Cocurdex -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
    `[void][Cocurdex.Power]::SetThreadExecutionState([uint32]"${ES_CONTINUOUS_SYSTEM_REQUIRED}")`,
    `while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }`,
  ].join("; ");
}

export function keepAwakeCommand(
  platform: NodeJS.Platform,
  pid: number,
): KeepAwakeCommand | null {
  if (platform === "darwin") {
    return { command: "caffeinate", args: ["-i", "-w", String(pid)] };
  }
  if (platform === "linux") {
    return {
      command: "systemd-inhibit",
      args: [
        "--what=idle",
        "--who=Cocurdex",
        "--why=Remote access is on",
        "--mode=block",
        "tail",
        `--pid=${pid}`,
        "-f",
        "/dev/null",
      ],
    };
  }
  if (platform === "win32") {
    return {
      command: "powershell",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        windowsKeepAwakeScript(pid),
      ],
    };
  }
  return null;
}

export interface KeepAwakeOptions {
  platform: NodeJS.Platform;
  pid: number;
  onError(error: Error): void;
}

export function createKeepAwake(options: KeepAwakeOptions) {
  let holder: ChildProcess | null = null;

  function release() {
    const current = holder;
    holder = null;
    if (current?.pid) {
      void killProcessTree(current.pid).catch(options.onError);
    }
  }

  return {
    set(active: boolean) {
      if (!active) {
        release();
        return;
      }
      if (holder) return;
      const command = keepAwakeCommand(options.platform, options.pid);
      if (!command) return;
      const child = spawnCommand(command.command, command.args, {
        stdio: "ignore",
        windowsHide: true,
      });
      holder = child;
      child.once("error", (error) => {
        if (holder === child) holder = null;
        options.onError(error);
      });
      child.once("exit", () => {
        if (holder === child) holder = null;
      });
    },
    dispose: release,
  };
}
