import path from "node:path";
import type {
  InstalledSkill,
  InstalledSkillDetail,
  SkillLibraryList,
  SkillLinkAgent,
  SkillRef,
  SkillTarget,
} from "@cocurdex/shared";
import { skillLinkAgentsForScope } from "@cocurdex/shared";
import {
  readScopeLock,
  refIn,
  resolveScopeContext,
  type ScopeContext,
  scopeLabel,
  type WorkspaceResolver,
} from "./skill-context";
import { readSkillDocument } from "./skill-document";
import { toSkillFileEntries } from "./skill-files";
import {
  copySkillDirectory,
  moveDirectory,
  removeEntry,
  type SkillBackups,
} from "./skill-fs";
import { type ScannedSkill, scanInstalledSkills } from "./skill-inventory";
import { createSkillLink, readSkillEntry } from "./skill-links";
import {
  linkAgentRoot,
  rootDir,
  type SkillLocationEnv,
} from "./skill-locations";
import { withoutLockEntry, writeSkillLock } from "./skill-locks";
import type { SkillUpdateCache } from "./skill-update-cache";

export interface SkillLibraryDeps {
  env: SkillLocationEnv;
  platform: NodeJS.Platform;
  resolveWorkspace: WorkspaceResolver;
  builtinNames: ReadonlySet<string>;
  backups: SkillBackups;
  updates: SkillUpdateCache;
}

export class SkillLibrary {
  constructor(private readonly deps: SkillLibraryDeps) {}

  context(target: SkillTarget) {
    return resolveScopeContext(
      target,
      this.deps.env,
      this.deps.resolveWorkspace,
    );
  }

  async scan(context: ScopeContext): Promise<ScannedSkill[]> {
    const lock = await readScopeLock(context);
    return scanInstalledSkills({
      scope: context.scope,
      workspaceId: context.workspace?.id ?? null,
      roots: context.roots,
      lockEntries: lock.skills,
      builtinNames: this.deps.builtinNames,
      platform: this.deps.platform,
    });
  }

  private async withUpdates(scanned: ScannedSkill[]) {
    const cache = await this.deps.updates.read();
    return scanned.map(
      (entry): InstalledSkill => ({
        ...entry.skill,
        update: this.deps.updates.infoFor(cache, entry.skill, entry.lockHash),
      }),
    );
  }

  async list(workspaceId?: string | null): Promise<SkillLibraryList> {
    const contexts = [await this.context({ scope: "global" })];
    if (workspaceId) {
      contexts.push(await this.context({ scope: "workspace", workspaceId }));
    }
    const scanned = await Promise.all(
      contexts.map((context) => this.scan(context)),
    );
    return {
      skills: await this.withUpdates(scanned.flat()),
      workspace: contexts[1]?.workspace ?? null,
    };
  }

  async find(ref: SkillRef) {
    const context = await this.context(ref);
    const found = (await this.scan(context)).find(
      (entry) => entry.skill.name === ref.name,
    );
    if (!found) {
      throw new Error(`Skill not found: ${ref.name}`);
    }
    return { context, found };
  }

  async show(ref: SkillRef): Promise<InstalledSkillDetail> {
    const { found } = await this.find(ref);
    const [skill] = await this.withUpdates([found]);
    const canonical = await readSkillEntry(found.canonical.entryPath);
    const dir =
      canonical.kind === "directory" || canonical.kind === "link"
        ? canonical.realPath
        : null;
    return {
      skill: skill as InstalledSkill,
      files: toSkillFileEntries(found.files, this.deps.platform),
      document: dir ? await readSkillDocument(dir) : null,
    };
  }

  private assertManageable(found: ScannedSkill) {
    if (found.skill.builtin) {
      throw new Error(
        `${found.skill.name} belongs to the Cocurdex workflow pack; manage it from the pack instead`,
      );
    }
  }

  async remove(ref: SkillRef) {
    const { context, found } = await this.find(ref);
    this.assertManageable(found);
    const label = scopeLabel(context);
    for (const entry of found.entries) {
      if (entry.state.kind === "directory") {
        await this.deps.backups.keep(entry.entryPath, label);
      } else {
        await removeEntry(entry.entryPath);
      }
    }
    const lock = await readScopeLock(context);
    if (lock.skills[ref.name]) {
      await writeSkillLock(withoutLockEntry(lock, ref.name));
    }
    await this.deps.updates.forget(refIn(context, ref.name));
    return { removed: true };
  }

  async setAgentLink(ref: SkillRef, agent: SkillLinkAgent, enabled: boolean) {
    const { context, found } = await this.find(ref);
    if (!skillLinkAgentsForScope(context.scope).includes(agent)) {
      throw new Error(`${agent} reads this scope's shared skills directly`);
    }
    const visibility = found.skill.agents.find((row) => row.agent === agent);
    if (!visibility?.toggleable) {
      throw new Error(`${ref.name} cannot be linked for ${agent}`);
    }
    const linkPath = path.join(
      rootDir(context.roots, linkAgentRoot(agent)),
      ref.name,
    );
    if (enabled) {
      if (visibility.access === "copy") {
        await removeEntry(linkPath);
      }
      if (visibility.access !== "link") {
        await createSkillLink(found.skill.path, linkPath, this.deps.platform);
      }
    } else if (visibility.access !== "none") {
      await removeEntry(linkPath);
    }
    return this.show(ref);
  }

  async share(ref: SkillRef) {
    const { context, found } = await this.find(ref);
    this.assertManageable(found);
    if (found.skill.root === "agents") {
      return this.show(ref);
    }
    if (found.canonical.state.kind !== "directory") {
      throw new Error(`${ref.name} is a link; share the folder it points to`);
    }
    const sharedPath = path.join(rootDir(context.roots, "agents"), ref.name);
    if ((await readSkillEntry(sharedPath)).kind !== "missing") {
      throw new Error(`A shared skill named ${ref.name} already exists`);
    }
    await moveDirectory(found.canonical.entryPath, sharedPath);
    await createSkillLink(
      sharedPath,
      found.canonical.entryPath,
      this.deps.platform,
    );
    return this.show(ref);
  }

  async resolveDuplicate(ref: SkillRef, keepPath: string) {
    const { context, found } = await this.find(ref);
    this.assertManageable(found);
    const keep = found.entries.find(
      (entry) => path.resolve(entry.entryPath) === path.resolve(keepPath),
    );
    if (!keep || keep.state.kind === "brokenLink") {
      throw new Error(`No copy of ${ref.name} at ${keepPath}`);
    }
    const label = scopeLabel(context);
    const sharedPath = path.join(rootDir(context.roots, "agents"), ref.name);
    const keepIsShared =
      path.resolve(keep.entryPath) === path.resolve(sharedPath);
    if (!keepIsShared) {
      const staged = `${sharedPath}.keep-${Date.now()}`;
      if (keep.state.kind === "link") {
        await copySkillDirectory(keep.state.realPath, staged);
      } else {
        await moveDirectory(keep.entryPath, staged);
      }
      await this.deps.backups.keep(sharedPath, label);
      await moveDirectory(staged, sharedPath);
    }
    for (const entry of found.entries) {
      if (path.resolve(entry.entryPath) === path.resolve(sharedPath)) {
        continue;
      }
      if (entry.state.kind === "directory") {
        await this.deps.backups.keep(entry.entryPath, label);
      } else {
        await removeEntry(entry.entryPath);
      }
      await createSkillLink(sharedPath, entry.entryPath, this.deps.platform);
    }
    return this.show(ref);
  }
}
