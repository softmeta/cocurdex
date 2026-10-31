import { stat } from "node:fs/promises";
import type {
  SkillSourceSkill,
  SkillSourceSkillDetail,
  SkillSourceSnapshot,
} from "@cocurdex/shared";
import {
  type DiscoveredSkill,
  discoverLocalSkills,
  discoverSnapshotSkills,
} from "./skill-discovery";
import { readSkillDocument } from "./skill-document";
import { computeGitTreeSha } from "./skill-files";
import { isValidSkillName } from "./skill-manifest";
import type {
  GithubSnapshot,
  GithubSnapshotStore,
  SnapshotFile,
} from "./skill-snapshots";
import {
  githubSourceId,
  githubSourceUrl,
  parseSkillSourceInput,
  type SkillSourceInput,
} from "./skill-source-input";

export interface LoadedSkillSource {
  input: SkillSourceInput;
  snapshot: SkillSourceSnapshot;
  skills: DiscoveredSkill[];
  github: GithubSnapshot | null;
}

export interface SkillSourceLoaderDeps {
  snapshots: GithubSnapshotStore;
  home: string;
  platform: NodeJS.Platform;
}

const BLOCKING_ISSUES = new Set(["missingFrontmatter", "missingDescription"]);

export function isInstallable(
  skill: Pick<SkillSourceSkill, "name" | "issues">,
) {
  return (
    isValidSkillName(skill.name) &&
    !skill.issues.some((issue) => BLOCKING_ISSUES.has(issue))
  );
}

function publicSkill(skill: DiscoveredSkill): SkillSourceSkill {
  return {
    name: skill.name,
    skillPath: skill.skillPath,
    description: skill.description,
    issues: skill.issues,
    installable: isInstallable(skill),
    fileCount: skill.fileCount,
    scriptCount: skill.scriptCount,
  };
}

export function githubTreeShaFor(files: SnapshotFile[], skillPath: string) {
  const prefix = skillPath ? `${skillPath}/` : "";
  return computeGitTreeSha(
    files
      .filter((file) => file.path.startsWith(prefix))
      .map((file) => ({
        path: file.path.slice(prefix.length),
        mode: file.mode,
        sha: file.sha,
      })),
  );
}

export class SkillSourceLoader {
  constructor(private readonly deps: SkillSourceLoaderDeps) {}

  parse(raw: string, ref?: string | null) {
    const input = parseSkillSourceInput(raw, {
      home: this.deps.home,
      platform: this.deps.platform,
    });
    if (input.kind === "github" && ref) {
      return { ...input, ref };
    }
    return input;
  }

  async load(
    input: SkillSourceInput,
    options: { refresh?: boolean } = {},
  ): Promise<LoadedSkillSource> {
    if (input.kind === "local") {
      const info = await stat(input.path).catch(() => null);
      if (!info?.isDirectory()) {
        throw new Error(`Folder not found: ${input.path}`);
      }
      const skills = await discoverLocalSkills(input.path, this.deps.platform);
      return {
        input,
        github: null,
        skills,
        snapshot: {
          kind: "local",
          source: input.path,
          url: null,
          ref: null,
          commit: null,
          skills: skills.map(publicSkill),
        },
      };
    }
    const github = await this.deps.snapshots.load(
      input.owner,
      input.repo,
      input.ref,
      options,
    );
    const skills = await discoverSnapshotSkills(
      github.dir,
      github.files,
      input.subpath,
      input.repo,
    );
    return {
      input,
      github,
      skills,
      snapshot: {
        kind: "github",
        source: githubSourceId(input),
        url: githubSourceUrl(input),
        ref: input.ref,
        commit: github.commit,
        skills: skills.map(publicSkill),
      },
    };
  }

  async inspect(raw: string, ref?: string | null) {
    return (await this.load(this.parse(raw, ref), { refresh: true })).snapshot;
  }

  async show(
    raw: string,
    skillPath: string,
    ref?: string | null,
  ): Promise<SkillSourceSkillDetail> {
    const loaded = await this.load(this.parse(raw, ref));
    const skill = loaded.skills.find((entry) => entry.skillPath === skillPath);
    if (!skill) {
      throw new Error(`No skill at ${skillPath || "the source root"}`);
    }
    return {
      source: loaded.snapshot,
      skill: publicSkill(skill),
      files: skill.files,
      document: await readSkillDocument(skill.absoluteDir),
    };
  }
}
