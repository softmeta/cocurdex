import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeWorkspaceFile,
  UnsafeWorkspacePathError,
} from "./path-safety";

/** Mode used when restoring a file that does not currently exist. */
export const DEFAULT_RESTORED_FILE_MODE = 0o644;

export async function writeFileAtomically(
  targetPath: string,
  bytes: Buffer,
  options: {
    mode?: number;
    workspaceRootPath?: string;
    relativePath?: string;
  } = {},
) {
  if (options.workspaceRootPath && options.relativePath) {
    await assertSafeWorkspaceFile(
      options.workspaceRootPath,
      options.relativePath,
    );
  }

  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });

  if (options.workspaceRootPath && options.relativePath) {
    await assertSafeWorkspaceFile(
      options.workspaceRootPath,
      options.relativePath,
    );
  }

  const directoryGuard = await captureDirectoryGuard(directory);
  try {
    const existing = await lstat(targetPath).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new UnsafeWorkspacePathError(
        `Refusing to replace symlink at ${options.relativePath ?? targetPath}`,
      );
    }

    const mode =
      options.mode ??
      (existing?.isFile() ? existing.mode & 0o777 : DEFAULT_RESTORED_FILE_MODE);
    const tempPath = path.join(directory, `.cocurdex-restore-${randomUUID()}`);
    try {
      const handle = await open(
        tempPath,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          noFollowFlag(),
        mode,
      );
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (process.platform !== "win32") {
        await chmod(tempPath, mode);
      }
      if (options.workspaceRootPath && options.relativePath) {
        await assertSafeWorkspaceFile(
          options.workspaceRootPath,
          options.relativePath,
        );
      }
      await assertDirectoryGuard(directory, directoryGuard.stats);
      await replaceFile(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  } finally {
    await directoryGuard.handle.close();
  }
}

export async function removeWorkspaceFile(
  workspaceRootPath: string,
  relativePath: string,
) {
  const resolved = await assertSafeWorkspaceFile(
    workspaceRootPath,
    relativePath,
  );
  const directory = path.dirname(resolved.absolute);
  const directoryGuard = await captureDirectoryGuard(directory);
  try {
    await assertSafeWorkspaceFile(workspaceRootPath, relativePath);
    await assertDirectoryGuard(directory, directoryGuard.stats);
    await rm(resolved.absolute, { force: true });
  } finally {
    await directoryGuard.handle.close();
  }
}

async function replaceFile(tempPath: string, targetPath: string) {
  // libuv maps rename to the platform replacement primitive. If Windows
  // refuses replacement because another process has the target open, fail
  // without first moving the original out of the way; recovery can then run
  // against an intact workspace.
  await rename(tempPath, targetPath);
}

function noFollowFlag() {
  return "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
}

function directoryFlag() {
  return "O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0;
}

async function captureDirectoryGuard(directory: string) {
  const handle = await open(
    directory,
    constants.O_RDONLY | directoryFlag() | noFollowFlag(),
  );
  return { handle, stats: await handle.stat() };
}

async function assertDirectoryGuard(
  directory: string,
  expected: { dev: number | bigint; ino: number | bigint },
) {
  const current = await lstat(directory).catch(() => null);
  if (
    !current?.isDirectory() ||
    current.isSymbolicLink() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino
  ) {
    throw new UnsafeWorkspacePathError(
      `Workspace directory changed before mutation: ${directory}`,
    );
  }
}
