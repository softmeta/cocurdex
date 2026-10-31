import fs from "node:fs/promises";
import path from "node:path";
import { isExpired } from "./log-paths";

export interface PruneOptions {
  retentionDays: number;
  now?: number;
  maxFiles?: number;
  match?: (name: string) => boolean;
}

interface LogFileStat {
  path: string;
  mtimeMs: number;
}

async function removeFile(filePath: string) {
  try {
    await fs.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function pruneLogFiles(
  directory: string,
  options: PruneOptions,
): Promise<string[]> {
  const now = options.now ?? Date.now();
  const match = options.match ?? ((name: string) => name.endsWith(".log"));

  let dirEntries: import("node:fs").Dirent<string>[];
  try {
    dirEntries = await fs.readdir(directory, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return [];
  }

  const files: LogFileStat[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() || !match(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat) {
      files.push({ path: filePath, mtimeMs: stat.mtimeMs });
    }
  }

  const removed: string[] = [];
  const survivors: LogFileStat[] = [];
  for (const file of files) {
    if (isExpired(file.mtimeMs, now, options.retentionDays)) {
      if (await removeFile(file.path)) {
        removed.push(file.path);
      }
    } else {
      survivors.push(file);
    }
  }

  if (options.maxFiles && survivors.length > options.maxFiles) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const overflow = survivors.length - options.maxFiles;
    for (let index = 0; index < overflow; index += 1) {
      if (await removeFile(survivors[index].path)) {
        removed.push(survivors[index].path);
      }
    }
  }

  return removed;
}
