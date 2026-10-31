import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  InstalledSkill,
  SkillAgentVisibility,
  SkillCopy,
  SkillLibraryScope,
  SkillLinkAgent,
  SkillProblem,
  SkillRootId,
} from "@cocurdex/shared";
import { skillLinkAgentsForScope } from "@cocurdex/shared";
import {
  computeSkillContentHash,
  countScripts,
  listSkillFiles,
  type SkillFileRecord,
  toSkillFileEntries,
} from "./skill-files";
import { readSkillEntry, type SkillEntryState } from "./skill-links";
import { linkAgentRoot, type SkillRootLocation } from "./skill-locations";
import { type SkillLockEntry, sourceInfoFromLock } from "./skill-locks";
import { parseSkillManifest, SKILL_FILE_NAME } from "./skill-manifest";

export interface SkillRootEntry {
  name: string;
  root: SkillRootId;
  entryPath: string;
  state: SkillEntryState;
}

interface ResolvedEntry extends SkillRootEntry {
  realPath: string;
}

export interface InventoryInput {
  scope: SkillLibraryScope;
  workspaceId: string | null;
  roots: SkillRootLocation[];
  lockEntries: Record<string, SkillLockEntry>;
  builtinNames: ReadonlySet<string>;
  platform?: NodeJS.Platform;
}

export interface ScannedSkill {
  skill: InstalledSkill;
  lockHash: string | null;
  canonical: SkillRootEntry;
  entries: SkillRootEntry[];
  files: SkillFileRecord[];
}

async function hasSkillFile(dir: string) {
  try {
    await readFile(path.join(dir, SKILL_FILE_NAME));
    return true;
  } catch {
    return false;
  }
}

async function scanRoot(root: SkillRootLocation): Promise<SkillRootEntry[]> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(root.dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries = await Promise.all(
    dirents
      .filter(
        (dirent) =>
          !dirent.name.startsWith(".") &&
          (dirent.isDirectory() || dirent.isSymbolicLink()),
      )
      .map(async (dirent): Promise<SkillRootEntry | null> => {
        const entryPath = path.join(root.dir, dirent.name);
        const state = await readSkillEntry(entryPath);
        if (state.kind === "missing") {
          return null;
        }
        if (state.kind !== "brokenLink" && !(await hasSkillFile(entryPath))) {
          return null;
        }
        return { name: dirent.name, root: root.id, entryPath, state };
      }),
  );
  return entries.filter((entry): entry is SkillRootEntry => entry !== null);
}

export async function scanSkillRoots(
  roots: SkillRootLocation[],
): Promise<Map<string, SkillRootEntry[]>> {
  const perRoot = await Promise.all(roots.map(scanRoot));
  const byName = new Map<string, SkillRootEntry[]>();
  for (const entries of perRoot) {
    for (const entry of entries) {
      byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
    }
  }
  return byName;
}

function resolved(entry: SkillRootEntry): entry is ResolvedEntry {
  return entry.state.kind === "directory" || entry.state.kind === "link";
}

function realPathOf(entry: ResolvedEntry) {
  return (entry.state as { realPath: string }).realPath;
}

function latestModified(files: SkillFileRecord[]) {
  const latest = Math.max(0, ...files.map((file) => file.modifiedAt));
  return latest > 0 ? new Date(latest).toISOString() : null;
}

type EntryRelation = "same" | "copy" | "divergent";

async function relationsTo(
  canonical: ResolvedEntry,
  others: ResolvedEntry[],
): Promise<Map<ResolvedEntry, EntryRelation>> {
  const relations = new Map<ResolvedEntry, EntryRelation>();
  const canonicalReal = realPathOf(canonical);
  let canonicalHash: string | null = null;
  for (const entry of others) {
    if (realPathOf(entry) === canonicalReal) {
      relations.set(entry, "same");
      continue;
    }
    canonicalHash ??= await computeSkillContentHash(canonicalReal);
    const hash = await computeSkillContentHash(realPathOf(entry));
    relations.set(entry, hash === canonicalHash ? "copy" : "divergent");
  }
  return relations;
}

async function describeCopy(entry: ResolvedEntry): Promise<SkillCopy> {
  const files = await listSkillFiles(realPathOf(entry));
  return {
    root: entry.root,
    path: entry.entryPath,
    contentHash: await computeSkillContentHash(realPathOf(entry), files),
    modifiedAt: latestModified(files),
    fileCount: files.length,
  };
}

function agentVisibility(
  agent: SkillLinkAgent,
  canonical: ResolvedEntry,
  entries: SkillRootEntry[],
  relations: Map<ResolvedEntry, EntryRelation>,
): SkillAgentVisibility {
  const root = linkAgentRoot(agent);
  if (canonical.root === root) {
    return {
      agent,
      access: "home",
      path: canonical.entryPath,
      toggleable: false,
    };
  }
  const shareable = canonical.root === "agents";
  const entry = entries.find((candidate) => candidate.root === root);
  if (!entry || !resolved(entry)) {
    return { agent, access: "none", path: null, toggleable: shareable };
  }
  const relation = relations.get(entry);
  if (relation === "same") {
    return {
      agent,
      access: "link",
      path: entry.entryPath,
      toggleable: shareable,
    };
  }
  return {
    agent,
    access: "copy",
    path: entry.entryPath,
    toggleable: shareable && relation === "copy",
  };
}

function brokenLinkProblems(entries: SkillRootEntry[]): SkillProblem[] {
  return entries
    .filter((entry) => entry.state.kind === "brokenLink")
    .map((entry) => ({ kind: "brokenLink", path: entry.entryPath }));
}

function lockHashOf(entry: SkillLockEntry | undefined) {
  const hash = entry?.skillFolderHash ?? entry?.computedHash;
  return typeof hash === "string" && hash ? hash : null;
}

function brokenOnlySkill(
  name: string,
  entries: SkillRootEntry[],
  input: InventoryInput,
): ScannedSkill {
  const first = entries[0] as SkillRootEntry;
  return {
    canonical: first,
    entries,
    files: [],
    lockHash: lockHashOf(input.lockEntries[name]),
    skill: {
      name,
      scope: input.scope,
      workspaceId: input.workspaceId,
      description: null,
      path: first.entryPath,
      root: first.root,
      builtin: input.builtinNames.has(name),
      source: sourceInfoFromLock(input.lockEntries[name]),
      agents: [],
      problems: brokenLinkProblems(entries),
      fileCount: 0,
      scriptCount: 0,
      update: null,
    },
  };
}

async function buildSkill(
  name: string,
  entries: SkillRootEntry[],
  input: InventoryInput,
): Promise<ScannedSkill> {
  const usable = entries.filter(resolved);
  const canonical =
    usable.find((entry) => entry.root === "agents") ?? usable[0];
  if (!canonical) {
    return brokenOnlySkill(name, entries, input);
  }
  const others = usable.filter((entry) => entry !== canonical);
  const relations = await relationsTo(canonical, others);
  const canonicalDir = realPathOf(canonical);
  const files = await listSkillFiles(canonicalDir);
  const fileEntries = toSkillFileEntries(files, input.platform);
  const manifestText = await readFile(
    path.join(canonicalDir, SKILL_FILE_NAME),
    "utf8",
  ).catch(() => "");
  const manifest = parseSkillManifest(manifestText, name);
  const divergent = others.filter(
    (entry) => relations.get(entry) === "divergent",
  );
  const problems: SkillProblem[] = [
    ...(manifest.issues.length
      ? [{ kind: "invalid" as const, issues: manifest.issues }]
      : []),
    ...(divergent.length
      ? [
          {
            kind: "duplicate" as const,
            copies: await Promise.all(
              [canonical, ...divergent].map(describeCopy),
            ),
          },
        ]
      : []),
    ...brokenLinkProblems(entries),
  ];
  const shared: SkillAgentVisibility = {
    agent: "shared",
    access: canonical.root === "agents" ? "native" : "none",
    path: canonical.root === "agents" ? canonical.entryPath : null,
    toggleable: false,
  };
  return {
    canonical,
    entries,
    files,
    lockHash: lockHashOf(input.lockEntries[name]),
    skill: {
      name,
      scope: input.scope,
      workspaceId: input.workspaceId,
      description: manifest.description,
      path: canonical.entryPath,
      root: canonical.root,
      builtin: input.builtinNames.has(name),
      source: sourceInfoFromLock(input.lockEntries[name]),
      agents: [
        shared,
        ...skillLinkAgentsForScope(input.scope).map((agent) =>
          agentVisibility(agent, canonical, entries, relations),
        ),
      ],
      problems,
      fileCount: files.length,
      scriptCount: countScripts(fileEntries),
      update: null,
    },
  };
}

export async function scanInstalledSkills(
  input: InventoryInput,
): Promise<ScannedSkill[]> {
  const byName = await scanSkillRoots(input.roots);
  const skills = await Promise.all(
    [...byName].map(([name, entries]) => buildSkill(name, entries, input)),
  );
  return skills.sort((left, right) =>
    left.skill.name.localeCompare(right.skill.name),
  );
}
