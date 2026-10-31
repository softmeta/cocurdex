import path from "node:path";
import type {
  SkillAddRequest,
  SkillAddResult,
  SkillLinkAgent,
} from "@cocurdex/shared";
import { skillLinkAgentsForScope } from "@cocurdex/shared";
import {
  readScopeLock,
  refIn,
  type ScopeContext,
  scopeLabel,
} from "./skill-context";
import type { DiscoveredSkill } from "./skill-discovery";
import { computeSkillContentHash } from "./skill-files";
import {
  copySkillDirectory,
  moveDirectory,
  removeEntry,
  type SkillBackups,
} from "./skill-fs";
import type { ScannedSkill } from "./skill-inventory";
import type { SkillLibrary } from "./skill-library-service";
import { createSkillLink } from "./skill-links";
import { linkAgentRoot, rootDir } from "./skill-locations";
import {
  type SkillLockEntry,
  type SkillLockFile,
  withLockEntry,
  writeSkillLock,
} from "./skill-locks";
import { SKILL_FILE_NAME } from "./skill-manifest";
import {
  githubTreeShaFor,
  isInstallable,
  type LoadedSkillSource,
  type SkillSourceLoader,
} from "./skill-sources";
import type { SkillUpdateCache } from "./skill-update-cache";

export interface SkillInstallerDeps {
  library: SkillLibrary;
  loader: SkillSourceLoader;
  backups: SkillBackups;
  updates: SkillUpdateCache;
  platform: NodeJS.Platform;
}

function lockSkillPath(skillPath: string) {
  return skillPath ? `${skillPath}/${SKILL_FILE_NAME}` : SKILL_FILE_NAME;
}

export async function lockEntryFor(
  context: ScopeContext,
  loaded: LoadedSkillSource,
  skill: DiscoveredSkill,
  installedDir: string,
): Promise<SkillLockEntry> {
  const { snapshot, github } = loaded;
  const base: SkillLockEntry = {
    source: snapshot.source,
    sourceType: snapshot.kind,
    ...(snapshot.url ? { sourceUrl: snapshot.url } : {}),
    ...(snapshot.ref ? { ref: snapshot.ref } : {}),
    skillPath: lockSkillPath(skill.skillPath),
  };
  if (context.lockKind === "project") {
    return {
      ...base,
      computedHash: await computeSkillContentHash(installedDir),
    };
  }
  return {
    ...base,
    skillFolderHash: github
      ? githubTreeShaFor(github.files, skill.skillPath)
      : "",
  };
}

export async function writeSkillContent(
  fromDir: string,
  targetDir: string,
  backups: SkillBackups,
  label: string,
) {
  const staged = `${targetDir}.incoming-${Date.now()}`;
  await copySkillDirectory(fromDir, staged);
  try {
    await backups.keep(targetDir, label);
    await moveDirectory(staged, targetDir);
  } catch (error) {
    await removeEntry(staged);
    throw error;
  }
}

export class SkillInstaller {
  constructor(private readonly deps: SkillInstallerDeps) {}

  private async clearExisting(context: ScopeContext, existing: ScannedSkill) {
    const label = scopeLabel(context);
    for (const entry of existing.entries) {
      if (entry.state.kind === "directory") {
        await this.deps.backups.keep(entry.entryPath, label);
      } else {
        await removeEntry(entry.entryPath);
      }
    }
  }

  private async linkAgents(
    context: ScopeContext,
    name: string,
    sharedDir: string,
    agents: SkillLinkAgent[],
  ) {
    const allowed = skillLinkAgentsForScope(context.scope);
    for (const agent of agents.filter((candidate) =>
      allowed.includes(candidate),
    )) {
      await createSkillLink(
        sharedDir,
        path.join(rootDir(context.roots, linkAgentRoot(agent)), name),
        this.deps.platform,
      );
    }
  }

  async add(request: SkillAddRequest): Promise<SkillAddResult> {
    const context = await this.deps.library.context(request);
    const loaded = await this.deps.loader.load(
      this.deps.loader.parse(request.source, request.ref),
    );
    const wanted = new Set(request.skillPaths);
    const selected = loaded.skills.filter((skill) =>
      wanted.has(skill.skillPath),
    );
    const missing = request.skillPaths.filter(
      (skillPath) => !selected.some((skill) => skill.skillPath === skillPath),
    );
    if (missing.length) {
      throw new Error(
        `No skill at ${missing.join(", ")} in ${loaded.snapshot.source}`,
      );
    }
    const installed = await this.deps.library.scan(context);
    const result: SkillAddResult = { installed: [], skipped: [] };
    let lock: SkillLockFile = await readScopeLock(context);
    const now = new Date().toISOString();
    for (const skill of selected) {
      if (!isInstallable(skill)) {
        result.skipped.push({ name: skill.name, reason: "invalid" });
        continue;
      }
      const existing = installed.find(
        (entry) => entry.skill.name === skill.name,
      );
      if (
        existing &&
        (existing.skill.builtin || !request.replace.includes(skill.name))
      ) {
        result.skipped.push({ name: skill.name, reason: "exists" });
        continue;
      }
      if (existing) {
        await this.clearExisting(context, existing);
      }
      const sharedDir = path.join(rootDir(context.roots, "agents"), skill.name);
      await writeSkillContent(
        skill.absoluteDir,
        sharedDir,
        this.deps.backups,
        scopeLabel(context),
      );
      await this.linkAgents(context, skill.name, sharedDir, request.agents);
      lock = withLockEntry(
        lock,
        skill.name,
        await lockEntryFor(context, loaded, skill, sharedDir),
        now,
      );
      await this.deps.updates.forget(refIn(context, skill.name));
      result.installed.push(skill.name);
    }
    if (result.installed.length) {
      await writeSkillLock(lock);
    }
    return result;
  }
}
