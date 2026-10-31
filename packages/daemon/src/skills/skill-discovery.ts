import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillFileEntry, SkillSourceSkill } from "@cocurdex/shared";
import {
  classifySkillFile,
  countScripts,
  listSkillFiles,
  toSkillFileEntries,
} from "./skill-files";
import {
  isValidSkillName,
  parseSkillManifest,
  SKILL_FILE_NAME,
} from "./skill-manifest";
import type { SnapshotFile } from "./skill-snapshots";

const MAX_DISCOVERY_DEPTH = 6;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

export interface DiscoveredSkill extends Omit<SkillSourceSkill, "installable"> {
  absoluteDir: string;
  files: SkillFileEntry[];
}

function prefixOf(skillPath: string) {
  return skillPath ? `${skillPath}/` : "";
}

export function snapshotSkillDirs(
  files: SnapshotFile[],
  subpath: string | null,
): string[] {
  const scope = subpath ? `${subpath}/` : "";
  const dirs = files
    .filter(
      (file) =>
        file.mode !== "120000" &&
        path.posix.basename(file.path) === SKILL_FILE_NAME &&
        (file.path === `${scope}${SKILL_FILE_NAME}` ||
          file.path.startsWith(scope)),
    )
    .map((file) => {
      const dir = path.posix.dirname(file.path);
      return dir === "." ? "" : dir;
    })
    .filter((dir) => dir.split("/").length <= MAX_DISCOVERY_DEPTH)
    .filter(
      (dir) => !dir.split("/").some((part) => SKIPPED_DIRECTORIES.has(part)),
    )
    .sort();
  return dirs.filter(
    (dir) =>
      !dirs.some((other) => other !== dir && dir.startsWith(prefixOf(other))),
  );
}

export function snapshotSkillFiles(
  files: SnapshotFile[],
  skillPath: string,
): SnapshotFile[] {
  const prefix = prefixOf(skillPath);
  return files
    .filter((file) => file.mode !== "120000" && file.path.startsWith(prefix))
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
}

async function localSkillDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, relative: string, depth: number) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    if (
      entries.some((entry) => entry.isFile() && entry.name === SKILL_FILE_NAME)
    ) {
      found.push(relative);
      return;
    }
    if (depth >= MAX_DISCOVERY_DEPTH) {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
        await walk(
          path.join(dir, entry.name),
          relative ? `${relative}/${entry.name}` : entry.name,
          depth + 1,
        );
      }
    }
  }
  await walk(root, "", 0);
  return found.sort();
}

export function installNameFor(
  manifestName: string | null,
  skillPath: string,
  fallback: string,
) {
  if (manifestName && isValidSkillName(manifestName)) {
    return manifestName;
  }
  return skillPath ? path.posix.basename(skillPath) : fallback;
}

async function describe(
  root: string,
  skillPath: string,
  files: SkillFileEntry[],
  fallbackName: string,
): Promise<DiscoveredSkill> {
  const absoluteDir = path.join(root, ...skillPath.split("/").filter(Boolean));
  const content = await readFile(
    path.join(absoluteDir, SKILL_FILE_NAME),
    "utf8",
  ).catch(() => "");
  const directoryName = skillPath
    ? path.posix.basename(skillPath)
    : fallbackName;
  const manifest = parseSkillManifest(content, directoryName);
  const name = installNameFor(manifest.name, skillPath, fallbackName);
  return {
    name,
    skillPath,
    description: manifest.description,
    issues: manifest.issues.filter((issue) => issue !== "nameMismatch"),
    fileCount: files.length,
    scriptCount: countScripts(files),
    absoluteDir,
    files,
  };
}

export async function discoverSnapshotSkills(
  root: string,
  files: SnapshotFile[],
  subpath: string | null,
  fallbackName: string,
): Promise<DiscoveredSkill[]> {
  return Promise.all(
    snapshotSkillDirs(files, subpath).map((skillPath) =>
      describe(
        root,
        skillPath,
        snapshotSkillFiles(files, skillPath).map((file) => ({
          path: file.path,
          size: file.size,
          kind: classifySkillFile(file.path, file.mode === "100755"),
        })),
        fallbackName,
      ),
    ),
  );
}

export async function discoverLocalSkills(
  root: string,
  platform: NodeJS.Platform = process.platform,
): Promise<DiscoveredSkill[]> {
  const fallbackName = path.basename(root);
  return Promise.all(
    (await localSkillDirs(root)).map(async (skillPath) => {
      const dir = path.join(root, ...skillPath.split("/").filter(Boolean));
      return describe(
        root,
        skillPath,
        toSkillFileEntries(await listSkillFiles(dir), platform),
        fallbackName,
      );
    }),
  );
}
