import path from "node:path";
import { PRODUCT_SKILL_NAMES } from "@cocurdex/product-skills";
import {
  primaryWorkspaceRootPath,
  type SkillAddRequest,
  type SkillLinkAgent,
  type SkillRef,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { OFFICIAL_SKILL_SOURCES, SkillCatalog } from "./skill-catalog";
import type { SettingsStore } from "./skill-context";
import { SkillBackups } from "./skill-fs";
import { SkillInstaller } from "./skill-installer";
import { SkillLibrary } from "./skill-library-service";
import { skillLocationEnvFromProcess } from "./skill-locations";
import { GithubSnapshotStore, githubTokenFromEnv } from "./skill-snapshots";
import { SkillSourceLoader } from "./skill-sources";
import { SkillUpdateCache } from "./skill-update-cache";
import { SkillUpdater } from "./skill-updates";

export interface SkillLibraryServiceOptions {
  userDataPath: string;
  home: string;
  settings: SettingsStore;
  listWorkspaces: () => Promise<WorkspaceRecord[]>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  snapshots?: GithubSnapshotStore;
  catalog?: SkillCatalog;
}

const AUDIT_BATCH_SIZE = 20;

export class DaemonSkillLibraryService {
  readonly library: SkillLibrary;
  private readonly loader: SkillSourceLoader;
  private readonly installer: SkillInstaller;
  private readonly updater: SkillUpdater;
  private readonly catalog: SkillCatalog;

  constructor(options: SkillLibraryServiceOptions) {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const backups = new SkillBackups(
      path.join(options.userDataPath, "skill-backups"),
    );
    const updates = new SkillUpdateCache(options.settings);
    this.catalog = options.catalog ?? new SkillCatalog();
    this.library = new SkillLibrary({
      env: skillLocationEnvFromProcess(options.home, env),
      platform,
      builtinNames: new Set(PRODUCT_SKILL_NAMES),
      backups,
      updates,
      resolveWorkspace: async (workspaceId) => {
        const workspace = (await options.listWorkspaces()).find(
          (candidate) => candidate.id === workspaceId,
        );
        const rootPath = workspace ? primaryWorkspaceRootPath(workspace) : "";
        return workspace && rootPath
          ? { id: workspace.id, name: workspace.name, rootPath }
          : null;
      },
    });
    this.loader = new SkillSourceLoader({
      snapshots:
        options.snapshots ??
        new GithubSnapshotStore(
          path.join(options.userDataPath, "skill-cache"),
          {
            token: githubTokenFromEnv(env),
          },
        ),
      home: options.home,
      platform,
    });
    const deps = {
      library: this.library,
      loader: this.loader,
      backups,
      updates,
      platform,
    };
    this.installer = new SkillInstaller(deps);
    this.updater = new SkillUpdater(deps);
  }

  list(workspaceId?: string | null) {
    return this.library.list(workspaceId);
  }

  show(ref: SkillRef) {
    return this.library.show(ref);
  }

  remove(ref: SkillRef) {
    return this.library.remove(ref);
  }

  setAgentLink(ref: SkillRef, agent: SkillLinkAgent, enabled: boolean) {
    return this.library.setAgentLink(ref, agent, enabled);
  }

  share(ref: SkillRef) {
    return this.library.share(ref);
  }

  resolveDuplicate(ref: SkillRef, keepPath: string) {
    return this.library.resolveDuplicate(ref, keepPath);
  }

  async searchCatalog(query: string, limit: number) {
    return { query, results: await this.catalog.search(query, limit) };
  }

  catalogSources() {
    return { sources: OFFICIAL_SKILL_SOURCES };
  }

  async auditCatalog(source: string, skillIds: string[]) {
    const batches: string[][] = [];
    for (let index = 0; index < skillIds.length; index += AUDIT_BATCH_SIZE) {
      batches.push(skillIds.slice(index, index + AUDIT_BATCH_SIZE));
    }
    const audits = await Promise.all(
      batches.map((batch) => this.catalog.audit(source, batch)),
    );
    return { audits: audits.flat() };
  }

  sourceKind(source: string) {
    return this.loader.parse(source);
  }

  inspectSource(source: string, ref?: string | null) {
    return this.loader.inspect(source, ref);
  }

  showSourceSkill(source: string, skillPath: string, ref?: string | null) {
    return this.loader.show(source, skillPath, ref);
  }

  add(request: SkillAddRequest) {
    return this.installer.add(request);
  }

  checkUpdates(workspaceId?: string | null) {
    return this.updater.check(workspaceId);
  }

  previewUpdate(ref: SkillRef) {
    return this.updater.preview(ref);
  }

  applyUpdates(refs: SkillRef[]) {
    return this.updater.apply(refs);
  }

  skipUpdate(ref: SkillRef, latestCommit: string) {
    return this.updater.skip(ref, latestCommit);
  }
}
