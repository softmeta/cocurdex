import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  inferReviewKind,
  type TurnFileChange,
  type TurnFileOperation,
} from "@cocurdex/shared";
import type { CheckpointBlobStore } from "./blob-store";
import { captureWorkspaceFile } from "./capture-file";
import {
  isIgnoredDirectoryName,
  isIgnoredWorkspacePath,
} from "./ignore-policy";

export interface ManifestEntry {
  path: string;
  hash: string;
  size: number;
  stored: boolean;
  mode?: number;
  /** Enables the stat cache below; absent in manifests written before it. */
  mtimeMs?: number;
  storeReason?: "too-large" | "quota" | "concurrent-modification";
}

export interface FilesystemManifest {
  id: string;
  sessionId: string;
  userMessageId: string;
  phase: string;
  createdAt: string;
  workspaceRootPath: string;
  files: ManifestEntry[];
}

export async function walkWorkspace(
  workspaceRootPath: string,
  blobStore: CheckpointBlobStore,
  previous?: Map<string, ManifestEntry>,
) {
  const files: ManifestEntry[] = [];

  async function walk(directory: string, relativeDirectory: string) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(
      () => null,
    );
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnoredDirectoryName(entry.name) || entry.name === ".cocurdex") {
          continue;
        }
        await walk(
          path.join(directory, entry.name),
          relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
        );
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (isIgnoredWorkspacePath(relativePath)) {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      const fileStat = await lstat(absolute).catch(() => null);
      if (!fileStat?.isFile() || fileStat.nlink > 1) {
        continue;
      }
      // Unchanged files skip the read+hash: the previous capture already
      // stored their bytes, which dominates checkpoint cost on big workspaces.
      const cached = previous?.get(relativePath);
      if (
        cached?.mtimeMs === fileStat.mtimeMs &&
        cached.size === fileStat.size &&
        (!cached.stored || (await blobStore.has(cached.hash)))
      ) {
        files.push({ ...cached, mode: fileStat.mode & 0o777 });
        continue;
      }
      const captured = await captureWorkspaceFile(absolute, {
        put: async (bytes) => blobStore.put(bytes),
        has: async (hash) => blobStore.has(hash),
      });
      files.push({
        path: relativePath,
        hash: captured.hash,
        size: captured.size,
        stored: captured.stored,
        mode: fileStat.mode & 0o777,
        mtimeMs: fileStat.mtimeMs,
        storeReason: captured.reason,
      });
    }
  }

  await walk(workspaceRootPath, "");
  return files;
}

export function diffManifests(
  before: FilesystemManifest,
  after: FilesystemManifest,
): TurnFileChange[] {
  const beforeByPath = new Map(before.files.map((file) => [file.path, file]));
  const afterByPath = new Map(after.files.map((file) => [file.path, file]));
  const beforeByHash = groupByHash(before.files);
  const afterByHash = groupByHash(after.files);
  const consumedAfter = new Set<string>();
  const files: TurnFileChange[] = [];

  for (const [relativePath, beforeFile] of beforeByPath) {
    const afterFile = afterByPath.get(relativePath);
    if (afterFile) {
      if (afterFile.hash !== beforeFile.hash) {
        files.push(
          toFileChange(
            relativePath,
            "modify",
            beforeFile.hash,
            afterFile.hash,
            afterFile.size,
            beforeFile.size,
            beforeFile.stored,
            beforeFile.storeReason,
          ),
        );
      }
      consumedAfter.add(relativePath);
      continue;
    }

    const candidates = afterByHash.get(beforeFile.hash) ?? [];
    const renameTarget = candidates.find(
      (candidate) =>
        !consumedAfter.has(candidate.path) && !beforeByPath.has(candidate.path),
    );
    const uniqueBefore = (beforeByHash.get(beforeFile.hash) ?? []).length === 1;
    const uniqueAfter =
      (afterByHash.get(beforeFile.hash) ?? []).filter(
        (candidate) => !beforeByPath.has(candidate.path),
      ).length === 1;
    if (renameTarget && uniqueBefore && uniqueAfter) {
      files.push({
        path: renameTarget.path,
        previousPath: relativePath,
        operation: "rename",
        reviewKind: inferReviewKind(renameTarget.path),
        beforeHash: beforeFile.hash,
        afterHash: renameTarget.hash,
        beforeSize: beforeFile.size,
        afterSize: renameTarget.size,
        restorable: beforeFile.stored,
        restoreFailureReason: beforeFile.storeReason,
      });
      consumedAfter.add(renameTarget.path);
      continue;
    }

    files.push(
      toFileChange(
        relativePath,
        "delete",
        beforeFile.hash,
        null,
        null,
        beforeFile.size,
        beforeFile.stored,
        beforeFile.storeReason,
      ),
    );
  }

  for (const [relativePath, afterFile] of afterByPath) {
    if (consumedAfter.has(relativePath) || beforeByPath.has(relativePath)) {
      continue;
    }
    files.push(
      toFileChange(
        relativePath,
        "add",
        null,
        afterFile.hash,
        afterFile.size,
        null,
        true,
        undefined,
      ),
    );
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function groupByHash(files: ManifestEntry[]) {
  const grouped = new Map<string, ManifestEntry[]>();
  for (const file of files) {
    const list = grouped.get(file.hash) ?? [];
    list.push(file);
    grouped.set(file.hash, list);
  }
  return grouped;
}

function toFileChange(
  relativePath: string,
  operation: TurnFileOperation,
  beforeHash: string | null,
  afterHash: string | null,
  afterSize: number | null,
  beforeSize: number | null,
  restorable: boolean,
  restoreFailureReason?: ManifestEntry["storeReason"],
): TurnFileChange {
  return {
    path: relativePath,
    operation,
    reviewKind: inferReviewKind(relativePath),
    beforeHash,
    afterHash,
    beforeSize,
    afterSize,
    restorable,
    restoreFailureReason: restorable ? null : (restoreFailureReason ?? null),
  };
}
