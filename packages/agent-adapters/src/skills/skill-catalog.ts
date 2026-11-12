import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ListSlashCommandsPayload } from "@cocurdex/agent-core";
import {
  type AgentId,
  type AgentSkillConvention,
  type AgentSlashCommand,
  getBuiltInAgentManifest,
} from "@cocurdex/shared";
import { parse } from "yaml";
import {
  type SkillLocationEnv,
  type SkillRootLocation,
  skillLocationEnvFromProcess,
  skillRoots,
} from "./skill-locations";

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
}

interface ListAgentSkillsOptions {
  env?: SkillLocationEnv;
}

function extractFrontmatter(content: string): SkillFrontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match?.[1]) {
    return null;
  }

  try {
    const value = parse(match[1]);
    return value && typeof value === "object"
      ? (value as SkillFrontmatter)
      : null;
  } catch {
    return null;
  }
}

const DEFAULT_SKILL_CONVENTION: AgentSkillConvention = {
  rootIds: ["agents"],
  invocation: (name) => `/${name} `,
};

function getSkillConvention(agentId: AgentId): AgentSkillConvention {
  return getBuiltInAgentManifest(agentId)?.skills ?? DEFAULT_SKILL_CONVENTION;
}

function agentRootDirs(roots: SkillRootLocation[], agentId: AgentId) {
  return getSkillConvention(agentId).rootIds.flatMap((id) =>
    roots.filter((root) => root.id === id).map((root) => root.dir),
  );
}

function getAgentSkillRoots(
  agentId: AgentId,
  workspaceRootPath: string,
  env: SkillLocationEnv,
): string[] {
  const global = agentRootDirs(skillRoots("global", env), agentId);
  if (!workspaceRootPath) return global;
  const workspace = agentRootDirs(
    skillRoots("workspace", env, workspaceRootPath),
    agentId,
  );
  return [...global, ...workspace];
}

async function readSkill(
  skillFilePath: string,
  agentId: AgentId,
): Promise<AgentSlashCommand | null> {
  try {
    const content = await readFile(skillFilePath, "utf8");
    const frontmatter = extractFrontmatter(content);
    const directoryName = path.basename(path.dirname(skillFilePath));
    const name =
      typeof frontmatter?.name === "string" && frontmatter.name.trim()
        ? frontmatter.name.trim()
        : directoryName;
    const description =
      typeof frontmatter?.description === "string"
        ? frontmatter.description.trim()
        : undefined;

    return {
      name,
      description: description || undefined,
      invocation: getSkillConvention(agentId).invocation(name),
      source: "skill",
    };
  } catch {
    return null;
  }
}

async function findSkillFiles(rootPath: string): Promise<string[]> {
  try {
    const entries = await readdir(rootPath, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      return [path.join(rootPath, "SKILL.md")];
    }
    const nestedFiles = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => {
          const entryPath = path.join(rootPath, entry.name);
          if (entry.isDirectory()) {
            return findSkillFiles(entryPath);
          }
          return findLinkedSkillFile(entryPath);
        }),
    );
    return nestedFiles.flat();
  } catch {
    return [];
  }
}

async function findLinkedSkillFile(skillPath: string): Promise<string[]> {
  const skillFilePath = path.join(skillPath, "SKILL.md");
  try {
    await readFile(skillFilePath, "utf8");
    return [skillFilePath];
  } catch {
    return [];
  }
}

async function readSkillRoot(
  rootPath: string,
  agentId: AgentId,
): Promise<AgentSlashCommand[]> {
  try {
    const skillFiles = await findSkillFiles(rootPath);
    const skills = await Promise.all(
      skillFiles.map((skillFile) => readSkill(skillFile, agentId)),
    );
    return skills.filter((skill): skill is AgentSlashCommand => skill !== null);
  } catch {
    return [];
  }
}

export async function listAgentSkills(
  agentId: AgentId,
  payload: ListSlashCommandsPayload,
  options: ListAgentSkillsOptions = {},
): Promise<AgentSlashCommand[]> {
  const roots = getAgentSkillRoots(
    agentId,
    payload.workspaceRootPath,
    options.env ?? skillLocationEnvFromProcess(homedir()),
  );
  const discovered = await Promise.all(
    roots.map((rootPath) => readSkillRoot(rootPath, agentId)),
  );
  const byName = new Map<string, AgentSlashCommand>();

  for (const skills of discovered) {
    for (const skill of skills) {
      byName.set(skill.name, skill);
    }
  }

  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
