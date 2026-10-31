import {
  lstat,
  mkdir,
  readlink,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import path from "node:path";

export type SkillEntryState =
  | { kind: "directory"; realPath: string }
  | { kind: "link"; realPath: string }
  | { kind: "brokenLink" }
  | { kind: "missing" };

export async function readSkillEntry(
  entryPath: string,
): Promise<SkillEntryState> {
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(entryPath);
  } catch {
    return { kind: "missing" };
  }
  if (stats.isSymbolicLink()) {
    try {
      return { kind: "link", realPath: await realpath(entryPath) };
    } catch {
      return { kind: "brokenLink" };
    }
  }
  if (stats.isDirectory()) {
    return { kind: "directory", realPath: await realpath(entryPath) };
  }
  return { kind: "missing" };
}

export async function createSkillLink(
  targetDir: string,
  linkPath: string,
  platform: NodeJS.Platform = process.platform,
) {
  await mkdir(path.dirname(linkPath), { recursive: true });
  if (platform === "win32") {
    await symlink(path.resolve(targetDir), linkPath, "junction");
    return;
  }
  await symlink(
    path.relative(path.dirname(linkPath), path.resolve(targetDir)),
    linkPath,
    "dir",
  );
}

export async function removeSkillLink(linkPath: string) {
  const stats = await lstat(linkPath).catch(() => null);
  if (!stats) {
    return;
  }
  if (!stats.isSymbolicLink()) {
    throw new Error(`Not a link: ${linkPath}`);
  }
  await rm(linkPath, { force: true });
}

export async function linkTargetText(linkPath: string) {
  try {
    return await readlink(linkPath);
  } catch {
    return null;
  }
}
