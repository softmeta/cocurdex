import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnCommand } from "@cocurdex/agent-adapters";

export type FileManagerAction = "open" | "reveal";

export interface FileManagerCommand {
  command: string;
  args: string[];
  ignoreExitCode?: boolean;
  verbatimArguments?: boolean;
}

function linuxRevealCommands(targetPath: string): FileManagerCommand[] {
  return [
    {
      command: "dbus-send",
      args: [
        "--session",
        "--print-reply",
        "--dest=org.freedesktop.FileManager1",
        "--type=method_call",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1.ShowItems",
        `array:string:${pathToFileURL(targetPath, { windows: false }).href}`,
        "string:",
      ],
    },
    { command: "xdg-open", args: [path.posix.dirname(targetPath)] },
  ];
}

export function fileManagerCommands(
  action: FileManagerAction,
  targetPath: string,
  platform: NodeJS.Platform,
): FileManagerCommand[] {
  if (platform === "darwin") {
    const args = action === "reveal" ? ["-R", targetPath] : [targetPath];
    return [{ command: "open", args }];
  }
  if (platform === "win32") {
    const args =
      action === "reveal" ? [`/select,"${targetPath}"`] : [`"${targetPath}"`];
    return [
      {
        command: "explorer.exe",
        args,
        ignoreExitCode: true,
        verbatimArguments: true,
      },
    ];
  }
  if (action === "reveal") return linuxRevealCommands(targetPath);
  return [{ command: "xdg-open", args: [targetPath] }];
}

function runCommand(candidate: FileManagerCommand) {
  return new Promise<boolean>((resolve) => {
    const child = spawnCommand(candidate.command, candidate.args, {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: candidate.verbatimArguments,
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) =>
      resolve(candidate.ignoreExitCode === true || code === 0),
    );
    child.unref();
  });
}

async function runFirstSuccessful(commands: FileManagerCommand[]) {
  for (const candidate of commands) {
    if (await runCommand(candidate)) return;
  }
  throw new Error("No file manager could open the path");
}

export async function openDirectoryInFileManager(
  directoryPath: string,
  platform: NodeJS.Platform = process.platform,
) {
  const stats = await stat(directoryPath);
  if (!stats.isDirectory()) {
    throw new Error("Only directories can be opened in the file manager");
  }
  await runFirstSuccessful(
    fileManagerCommands("open", directoryPath, platform),
  );
}

export async function revealPathInFileManager(
  targetPath: string,
  platform: NodeJS.Platform = process.platform,
) {
  await stat(targetPath);
  await runFirstSuccessful(fileManagerCommands("reveal", targetPath, platform));
}
