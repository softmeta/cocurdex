import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ArchiveFormat = "zip" | "tar" | "raw";

export function getArchiveFormat(archiveUrl: string): ArchiveFormat {
  const name = new URL(archiveUrl).pathname.toLowerCase();
  if (name.endsWith(".zip")) {
    return "zip";
  }
  if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$/.test(name)) {
    return "tar";
  }
  return "raw";
}

type ExtractCommand = { command: string; args: string[] };

export function listExtractCommands(
  format: ArchiveFormat,
  file: string,
  directory: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ExtractCommand[] {
  const tarArgs = ["-xf", file, "-C", directory];
  if (platform === "win32") {
    const systemRoot = env.SystemRoot || env.windir || "C:\\Windows";
    return [
      {
        command: path.win32.join(systemRoot, "System32", "tar.exe"),
        args: tarArgs,
      },
    ];
  }
  if (format === "zip" && platform === "linux") {
    return [
      { command: "unzip", args: ["-q", "-o", file, "-d", directory] },
      { command: "bsdtar", args: tarArgs },
      { command: "python3", args: ["-m", "zipfile", "-e", file, directory] },
    ];
  }
  return [{ command: "tar", args: tarArgs }];
}

export async function extractArchive(
  format: ArchiveFormat,
  file: string,
  directory: string,
) {
  const candidates = listExtractCommands(format, file, directory);
  for (const [index, candidate] of candidates.entries()) {
    try {
      await execFileAsync(candidate.command, candidate.args, {
        windowsHide: true,
      });
      return;
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!missing || index === candidates.length - 1) {
        throw missing
          ? new Error(
              `Cannot extract ${path.basename(file)}: install unzip and retry`,
            )
          : error;
      }
    }
  }
}
