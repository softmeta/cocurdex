import { mkdtempSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface TempDirs {
  create(prefix: string): Promise<string>;
  createSync(prefix: string): string;
  onCleanup(release: () => unknown): void;
  cleanup(): Promise<void>;
}

async function releaseAll(releases: (() => unknown)[]) {
  const failures: unknown[] = [];
  for (const release of releases.reverse()) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

async function removeAll(directories: string[]) {
  const results = await Promise.allSettled(
    directories.map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      }),
    ),
  );
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

export function createTempDirs(): TempDirs {
  const created: string[] = [];
  const releases: (() => unknown)[] = [];
  return {
    async create(prefix) {
      const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
      created.push(directory);
      return directory;
    },
    createSync(prefix) {
      const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
      created.push(directory);
      return directory;
    },
    onCleanup(release) {
      releases.push(release);
    },
    async cleanup() {
      const failures = [
        ...(await releaseAll(releases.splice(0))),
        ...(await removeAll(created.splice(0))),
      ];
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(failures, "Temp directory cleanup failed");
      }
    },
  };
}
