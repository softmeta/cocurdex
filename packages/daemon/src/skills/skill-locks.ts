import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SkillSourceInfo, SkillSourceKind } from "@cocurdex/shared";

export type SkillLockKind = "global" | "project";

export interface SkillLockEntry {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  ref?: string;
  skillPath?: string;
  skillFolderHash?: string;
  computedHash?: string;
  installedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface SkillLockFile {
  kind: SkillLockKind;
  path: string;
  document: Record<string, unknown>;
  skills: Record<string, SkillLockEntry>;
}

const LOCK_VERSIONS: Record<SkillLockKind, number> = { global: 3, project: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyLock(kind: SkillLockKind, lockPath: string): SkillLockFile {
  return {
    kind,
    path: lockPath,
    document: { version: LOCK_VERSIONS[kind] },
    skills: {},
  };
}

export async function readSkillLock(
  kind: SkillLockKind,
  lockPath: string,
): Promise<SkillLockFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return emptyLock(kind, lockPath);
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.version !== "number" ||
    parsed.version < LOCK_VERSIONS[kind] ||
    !isRecord(parsed.skills)
  ) {
    return emptyLock(kind, lockPath);
  }
  const skills = Object.fromEntries(
    Object.entries(parsed.skills).filter(
      (entry): entry is [string, SkillLockEntry] => isRecord(entry[1]),
    ),
  );
  return { kind, path: lockPath, document: parsed, skills };
}

function serializeLock(lock: SkillLockFile) {
  if (lock.kind === "global") {
    return JSON.stringify({ ...lock.document, skills: lock.skills }, null, 2);
  }
  const skills = Object.fromEntries(
    Object.keys(lock.skills)
      .sort()
      .map((name) => [name, lock.skills[name]]),
  );
  return `${JSON.stringify({ ...lock.document, skills }, null, 2)}\n`;
}

export async function writeSkillLock(lock: SkillLockFile) {
  await mkdir(path.dirname(lock.path), { recursive: true });
  await writeFile(lock.path, serializeLock(lock), "utf8");
}

export function withLockEntry(
  lock: SkillLockFile,
  name: string,
  entry: SkillLockEntry,
  now: string,
): SkillLockFile {
  const previous = lock.skills[name];
  const stamped =
    lock.kind === "global"
      ? {
          ...entry,
          installedAt: previous?.installedAt ?? now,
          updatedAt: now,
        }
      : entry;
  return { ...lock, skills: { ...lock.skills, [name]: stamped } };
}

export function withoutLockEntry(
  lock: SkillLockFile,
  name: string,
): SkillLockFile {
  const { [name]: _removed, ...skills } = lock.skills;
  return { ...lock, skills };
}

function sourceKind(sourceType: string | undefined): SkillSourceKind {
  if (sourceType === "github" || sourceType === "local") {
    return sourceType;
  }
  return "other";
}

function skillDirectoryPath(skillPath: string | undefined) {
  if (!skillPath) {
    return null;
  }
  const directory = path.posix.dirname(skillPath);
  if (skillPath.endsWith("SKILL.md")) {
    return directory === "." ? "" : directory;
  }
  return skillPath;
}

export function lockEntrySkillDir(entry: SkillLockEntry) {
  return skillDirectoryPath(entry.skillPath);
}

export function sourceInfoFromLock(
  entry: SkillLockEntry | undefined,
): SkillSourceInfo | null {
  if (!entry?.source) {
    return null;
  }
  return {
    kind: sourceKind(entry.sourceType),
    source: entry.source,
    url: typeof entry.sourceUrl === "string" ? entry.sourceUrl : null,
    skillPath: skillDirectoryPath(entry.skillPath),
    ref: typeof entry.ref === "string" ? entry.ref : null,
    installedAt:
      typeof entry.installedAt === "string" ? entry.installedAt : null,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
  };
}
