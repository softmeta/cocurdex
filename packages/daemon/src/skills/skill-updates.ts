import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  SkillRef,
  SkillUpdateCandidate,
  SkillUpdateCheckResult,
  SkillUpdatePreview,
} from "@cocurdex/shared";
import {
  readScopeLock,
  refIn,
  type ScopeContext,
  scopeLabel,
  skillKey,
} from "./skill-context";
import type { DiscoveredSkill } from "./skill-discovery";
import { diffSkillDirectories } from "./skill-file-diff";
import {
  computeGitTreeSha,
  computeSkillContentHash,
  gitBlobSha,
  isExecutableMode,
  listSkillFiles,
} from "./skill-files";
import type { SkillBackups } from "./skill-fs";
import { lockEntryFor, writeSkillContent } from "./skill-installer";
import type { ScannedSkill } from "./skill-inventory";
import type { SkillLibrary } from "./skill-library-service";
import { readSkillEntry } from "./skill-links";
import { withLockEntry, writeSkillLock } from "./skill-locks";
import {
  githubTreeShaFor,
  type LoadedSkillSource,
  type SkillSourceLoader,
} from "./skill-sources";
import type { SkillUpdateCache, SkillUpdateRecord } from "./skill-update-cache";

export interface SkillUpdaterDeps {
  library: SkillLibrary;
  loader: SkillSourceLoader;
  backups: SkillBackups;
  updates: SkillUpdateCache;
  platform: NodeJS.Platform;
}

interface Tracked {
  context: ScopeContext;
  scanned: ScannedSkill;
}

function isTracked(scanned: ScannedSkill) {
  return scanned.skill.source?.kind === "github" && !scanned.skill.builtin;
}

function groupKey(scanned: ScannedSkill) {
  const source = scanned.skill.source;
  return `${source?.source ?? ""}#${source?.ref ?? ""}`;
}

function sourceSpec(scanned: ScannedSkill) {
  const source = scanned.skill.source;
  if (!source) {
    throw new Error(`${scanned.skill.name} has no recorded source`);
  }
  return { raw: source.source, ref: source.ref };
}

export function findSourceSkill(
  loaded: LoadedSkillSource,
  scanned: ScannedSkill,
) {
  const skillPath = scanned.skill.source?.skillPath;
  return (
    loaded.skills.find(
      (skill) =>
        skillPath !== null &&
        skillPath !== undefined &&
        skill.skillPath === skillPath,
    ) ?? loaded.skills.find((skill) => skill.name === scanned.skill.name)
  );
}

async function latestHashFor(
  context: ScopeContext,
  loaded: LoadedSkillSource,
  skill: DiscoveredSkill,
) {
  if (context.lockKind === "project" || !loaded.github) {
    return computeSkillContentHash(skill.absoluteDir);
  }
  return githubTreeShaFor(loaded.github.files, skill.skillPath);
}

async function installedTreeSha(dir: string) {
  const files = await listSkillFiles(dir);
  return computeGitTreeSha(
    await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        mode: isExecutableMode(file.mode)
          ? ("100755" as const)
          : ("100644" as const),
        sha: gitBlobSha(
          await readFile(path.join(dir, ...file.path.split("/"))),
        ),
      })),
    ),
  );
}

async function canonicalDir(scanned: ScannedSkill) {
  const state = await readSkillEntry(scanned.canonical.entryPath);
  return state.kind === "directory" || state.kind === "link"
    ? state.realPath
    : null;
}

export class SkillUpdater {
  constructor(private readonly deps: SkillUpdaterDeps) {}

  private async contexts(workspaceId?: string | null) {
    const contexts = [await this.deps.library.context({ scope: "global" })];
    if (workspaceId) {
      contexts.push(
        await this.deps.library.context({ scope: "workspace", workspaceId }),
      );
    }
    return contexts;
  }

  private async tracked(workspaceId?: string | null): Promise<Tracked[]> {
    const tracked: Tracked[] = [];
    for (const context of await this.contexts(workspaceId)) {
      for (const scanned of await this.deps.library.scan(context)) {
        if (isTracked(scanned)) {
          tracked.push({ context, scanned });
        }
      }
    }
    return tracked;
  }

  async check(workspaceId?: string | null): Promise<SkillUpdateCheckResult> {
    const tracked = await this.tracked(workspaceId);
    const groups = new Map<string, Tracked[]>();
    for (const entry of tracked) {
      const key = groupKey(entry.scanned);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    const checkedAt = new Date().toISOString();
    const records: Array<{ ref: SkillRef; record: SkillUpdateRecord }> = [];
    const failures: SkillUpdateCheckResult["failures"] = [];
    const checkedKeys: string[] = [];
    for (const entries of groups.values()) {
      const first = entries[0] as Tracked;
      const spec = sourceSpec(first.scanned);
      let loaded: LoadedSkillSource;
      try {
        loaded = await this.deps.loader.load(
          this.deps.loader.parse(spec.raw, spec.ref),
          { refresh: true },
        );
      } catch (error) {
        failures.push({
          source: spec.raw,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      for (const { context, scanned } of entries) {
        const ref = refIn(context, scanned.skill.name);
        checkedKeys.push(skillKey(ref));
        const skill = findSourceSkill(loaded, scanned);
        if (!skill || !loaded.snapshot.commit) {
          continue;
        }
        records.push({
          ref,
          record: {
            latestCommit: loaded.snapshot.commit,
            latestHash: await latestHashFor(context, loaded, skill),
            installedHash: scanned.lockHash,
          },
        });
      }
    }
    await this.deps.updates.record(checkedAt, records, checkedKeys);
    const cache = await this.deps.updates.read();
    const updates: SkillUpdateCandidate[] = records.flatMap(
      ({ ref, record }) => {
        const info = this.deps.updates.infoFor(
          cache,
          ref,
          record.installedHash,
        );
        if (!info) {
          return [];
        }
        const scanned = tracked.find(
          (entry) =>
            skillKey(refIn(entry.context, entry.scanned.skill.name)) ===
            skillKey(ref),
        );
        return [
          {
            ...ref,
            source: scanned?.scanned.skill.source?.source ?? "",
            currentHash: record.installedHash,
            latestCommit: info.latestCommit,
            skipped: info.skipped,
          },
        ];
      },
    );
    return { checkedAt, updates, failures };
  }

  private async load(ref: SkillRef) {
    const { context, found } = await this.deps.library.find(ref);
    if (!isTracked(found)) {
      throw new Error(`${ref.name} was not installed from GitHub`);
    }
    const spec = sourceSpec(found);
    const loaded = await this.deps.loader.load(
      this.deps.loader.parse(spec.raw, spec.ref),
    );
    const skill = findSourceSkill(loaded, found);
    if (!skill) {
      throw new Error(`${ref.name} is no longer in ${spec.raw}`);
    }
    return { context, found, loaded, skill };
  }

  private async localModified(
    context: ScopeContext,
    scanned: ScannedSkill,
    dir: string | null,
  ) {
    if (!dir || !scanned.lockHash) {
      return null;
    }
    if (context.lockKind === "project") {
      return (await computeSkillContentHash(dir)) !== scanned.lockHash;
    }
    const matches = (await installedTreeSha(dir)) === scanned.lockHash;
    if (!matches && this.deps.platform === "win32") {
      return null;
    }
    return !matches;
  }

  async preview(ref: SkillRef): Promise<SkillUpdatePreview> {
    const { context, found, loaded, skill } = await this.load(ref);
    const dir = await canonicalDir(found);
    return {
      ...refIn(context, ref.name),
      source: loaded.snapshot.source,
      latestCommit: loaded.snapshot.commit ?? "",
      localModified: await this.localModified(context, found, dir),
      changes: await diffSkillDirectories(
        dir,
        skill.absoluteDir,
        this.deps.platform,
      ),
    };
  }

  async apply(refs: SkillRef[]) {
    const updated: string[] = [];
    for (const ref of refs) {
      const { context, found, loaded, skill } = await this.load(ref);
      if (found.canonical.state.kind !== "directory") {
        throw new Error(
          `${ref.name} is a link; update the folder it points to`,
        );
      }
      const label = scopeLabel(context);
      await writeSkillContent(
        skill.absoluteDir,
        found.canonical.entryPath,
        this.deps.backups,
        label,
      );
      for (const entry of found.entries) {
        const copy = found.skill.agents.find(
          (agent) =>
            agent.access === "copy" &&
            agent.toggleable &&
            agent.path === entry.entryPath,
        );
        if (copy && entry.state.kind === "directory") {
          await writeSkillContent(
            skill.absoluteDir,
            entry.entryPath,
            this.deps.backups,
            label,
          );
        }
      }
      const lock = await readScopeLock(context);
      await writeSkillLock(
        withLockEntry(
          lock,
          ref.name,
          {
            ...lock.skills[ref.name],
            ...(await lockEntryFor(
              context,
              loaded,
              skill,
              found.canonical.entryPath,
            )),
          },
          new Date().toISOString(),
        ),
      );
      await this.deps.updates.forget(refIn(context, ref.name));
      updated.push(ref.name);
    }
    return { updated };
  }

  async skip(ref: SkillRef, latestCommit: string) {
    const { context } = await this.deps.library.find(ref);
    await this.deps.updates.skip(refIn(context, ref.name), latestCommit);
    return { skipped: true };
  }
}
