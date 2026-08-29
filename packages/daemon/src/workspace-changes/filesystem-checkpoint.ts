import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { removeWorkspaceFile, writeFileAtomically } from "./atomic-write";
import {
  type CheckpointBlobStore,
  getTurnWorkspaceChangesRoot,
} from "./blob-store";
import type { HostCheckpointAdapter, RestorePathResult } from "./checkpoint";
import {
  diffManifests,
  type FilesystemManifest,
  type ManifestEntry,
  walkWorkspace,
} from "./filesystem-manifest";
import { hashFile } from "./hash";
import {
  assertSafeRestorePlan,
  resolveWorkspacePath,
  UnsafeWorkspacePathError,
} from "./path-safety";

export function createFilesystemCheckpointAdapter(
  blobStore: CheckpointBlobStore,
  userDataPath: string,
): HostCheckpointAdapter {
  const manifestRoot = path.join(
    getTurnWorkspaceChangesRoot(userDataPath),
    "manifests",
  );
  // Last capture per workspace, used as a stat cache by walkWorkspace.
  const lastEntries = new Map<string, Map<string, ManifestEntry>>();

  async function writeManifest(manifest: FilesystemManifest) {
    await mkdir(manifestRoot, { recursive: true });
    await writeFileAtomically(
      path.join(manifestRoot, `${manifest.id}.json`),
      Buffer.from(JSON.stringify(manifest), "utf8"),
    );
  }

  async function readManifest(id: string): Promise<FilesystemManifest> {
    const raw = await readFile(path.join(manifestRoot, `${id}.json`), "utf8");
    return JSON.parse(raw) as FilesystemManifest;
  }

  async function listManifests() {
    const names = await readdir(manifestRoot).catch(() => []);
    const manifests: FilesystemManifest[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue;
      }
      try {
        manifests.push(await readManifest(name.slice(0, -".json".length)));
      } catch {
        // Skip unreadable manifests; reconcile will delete orphans later.
      }
    }
    return manifests;
  }

  return {
    kind: "filesystem-checkpoint",
    async capture(input) {
      const id = crypto.randomUUID();
      const workspaceKey = path.resolve(input.workspaceRootPath);
      const files = await walkWorkspace(
        input.workspaceRootPath,
        blobStore,
        lastEntries.get(workspaceKey),
      );
      lastEntries.set(
        workspaceKey,
        new Map(files.map((file) => [file.path, file])),
      );
      const manifest: FilesystemManifest = {
        id,
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
        phase: input.phase,
        createdAt: new Date().toISOString(),
        workspaceRootPath: input.workspaceRootPath,
        files,
      };
      await writeManifest(manifest);
      return {
        id,
        kind: "filesystem-checkpoint",
        ref: id,
        workspaceRootPath: input.workspaceRootPath,
      };
    },
    async diff(before, after) {
      const beforeManifest = await readManifest(before.ref);
      const afterManifest = await readManifest(after.ref);
      return diffManifests(beforeManifest, afterManifest);
    },
    async readFile(checkpoint, relativePath) {
      const manifest = await readManifest(checkpoint.ref);
      const entry = manifest.files.find((file) => file.path === relativePath);
      if (!entry?.stored) {
        return null;
      }
      return blobStore.get(entry.hash);
    },
    async restorePaths(input) {
      const manifest = await readManifest(input.checkpoint.ref);
      const byPath = new Map(manifest.files.map((file) => [file.path, file]));
      const results: RestorePathResult[] = [];
      for (let index = 0; index < input.paths.length; index += 1) {
        const plan = input.paths[index];
        if (!plan) {
          continue;
        }
        try {
          await assertSafeRestorePlan(input.workspaceRootPath, plan);
          if (plan.operation === "add") {
            await removeWorkspaceFile(input.workspaceRootPath, plan.path);
            results.push({ path: plan.path, status: "restored" });
            continue;
          }
          const targetRelative = plan.previousPath ?? plan.path;
          const entry = byPath.get(targetRelative);
          if (!entry?.stored) {
            results.push({
              path: plan.path,
              status: "failed",
              reason: "Checkpoint blob is unavailable",
            });
            continue;
          }
          const bytes = await blobStore.get(entry.hash);
          if (!bytes) {
            results.push({
              path: plan.path,
              status: "failed",
              reason: "Checkpoint blob is unavailable",
            });
            continue;
          }
          const target = resolveWorkspacePath(
            input.workspaceRootPath,
            targetRelative,
          );
          await writeFileAtomically(target.absolute, bytes, {
            mode: entry.mode,
            workspaceRootPath: input.workspaceRootPath,
            relativePath: targetRelative,
          });
          if (plan.operation === "rename") {
            await removeWorkspaceFile(input.workspaceRootPath, plan.path);
          }
          results.push({ path: plan.path, status: "restored" });
        } catch (error) {
          results.push({
            path: plan.path,
            status: "failed",
            reason:
              error instanceof Error ? error.message : "Failed to restore file",
          });
          if (error instanceof UnsafeWorkspacePathError) {
            for (const remaining of input.paths.slice(index + 1)) {
              results.push({
                path: remaining.path,
                status: "skipped",
                reason: "Restore aborted after an unsafe path was detected",
              });
            }
            break;
          }
        }
      }
      return results;
    },
    async hashWorkingTreeFile(workspaceRootPath, relativePath) {
      try {
        const resolved = resolveWorkspacePath(workspaceRootPath, relativePath);
        const hashed = await hashFile(resolved.absolute);
        return hashed.hash;
      } catch {
        return null;
      }
    },
    async referencedBlobHashes(refs) {
      const keep = new Set<string>();
      for (const ref of refs) {
        try {
          const manifest = await readManifest(ref);
          for (const file of manifest.files) {
            if (file.stored) {
              keep.add(file.hash);
            }
          }
        } catch {
          // Missing manifests are already gone.
        }
      }
      return keep;
    },
    async listCheckpoints() {
      const manifests = await listManifests();
      return manifests.map((manifest) => ({
        ref: manifest.id,
        sessionId: manifest.sessionId,
        createdAt: manifest.createdAt,
        phase: manifest.phase,
        workspaceRootPath: manifest.workspaceRootPath,
      }));
    },
    async cleanup(input) {
      const manifests = await listManifests();
      const refs = new Set(input.refs);
      for (const manifest of manifests) {
        const shouldDelete = input.pruneUnreferenced
          ? !refs.has(manifest.id)
          : refs.has(manifest.id) ||
            (input.sessionId != null && manifest.sessionId === input.sessionId);
        if (!shouldDelete) {
          continue;
        }
        await rm(path.join(manifestRoot, `${manifest.id}.json`), {
          force: true,
        });
      }
    },
  };
}
