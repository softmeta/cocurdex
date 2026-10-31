import { cp, lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const BACKUP_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const COPY_SKIPPED = new Set([".git", "node_modules"]);

export async function moveDirectory(from: string, to: string) {
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await cp(from, to, { recursive: true, verbatimSymlinks: true });
    await rm(from, { recursive: true, force: true });
  }
}

export async function copySkillDirectory(from: string, to: string) {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (source) => !COPY_SKIPPED.has(path.basename(source)),
  });
}

export async function removeEntry(entryPath: string) {
  const stats = await lstat(entryPath).catch(() => null);
  if (!stats) {
    return;
  }
  if (stats.isSymbolicLink()) {
    await rm(entryPath, { force: true });
    return;
  }
  await rm(entryPath, { recursive: true, force: true });
}

function backupStamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, "-");
}

export class SkillBackups {
  constructor(private readonly backupRoot: string) {}

  async keep(entryPath: string, label: string, now = new Date()) {
    const stats = await lstat(entryPath).catch(() => null);
    if (!stats) {
      return null;
    }
    if (stats.isSymbolicLink()) {
      await rm(entryPath, { force: true });
      return null;
    }
    const target = path.join(
      this.backupRoot,
      `${backupStamp(now)}-${label}-${path.basename(entryPath)}`,
    );
    await moveDirectory(entryPath, target);
    await this.prune(now);
    return target;
  }

  private async prune(now: Date) {
    const entries = await readdir(this.backupRoot).catch(() => []);
    const dated = await Promise.all(
      entries.map(async (name) => ({
        name,
        mtime: (await stat(path.join(this.backupRoot, name)).catch(() => null))
          ?.mtimeMs,
      })),
    );
    for (const entry of dated) {
      if (entry.mtime && now.getTime() - entry.mtime > BACKUP_RETENTION_MS) {
        await rm(path.join(this.backupRoot, entry.name), {
          recursive: true,
          force: true,
        });
      }
    }
  }
}
