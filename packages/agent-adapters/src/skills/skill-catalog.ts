import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ListSlashCommandsPayload } from "@cocurdex/agent-core";
import type { AgentId, AgentSlashCommand } from "@cocurdex/shared";
import { parse } from "yaml";

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
}

interface ListAgentSkillsOptions {
  homePath?: string;
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

function getAgentSkillRoots(
  agentId: AgentId,
  workspaceRootPath: string,
  homePath: string,
): string[] {
  const roots = [
    path.join(homePath, ".agents", "skills"),
    path.join(workspaceRootPath, ".agents", "skills"),
  ];

  if (agentId === "claude-agent") {
    roots.push(
      path.join(homePath, ".claude", "skills"),
      path.join(workspaceRootPath, ".claude", "skills"),
    );
  }
  if (agentId === "codex") {
    roots.push(
      path.join(homePath, ".codex", "skills"),
      path.join(workspaceRootPath, ".codex", "skills"),
    );
  }
  if (agentId === "opencode") {
    roots.push(
      path.join(homePath, ".config", "opencode", "skills"),
      path.join(homePath, ".opencode", "skills"),
      path.join(workspaceRootPath, ".opencode", "skills"),
    );
  }

  return roots;
}

function getSkillInvocation(agentId: AgentId, skillName: string): string {
  switch (agentId) {
    case "codex":
      return `$${skillName} `;
    case "pi":
      return `/skill:${skillName} `;
    case "claude-agent":
      return `/${skillName} `;
    case "grok-build":
      return `/${skillName} `;
    case "opencode":
      // OpenCode v1 exposes skills through its model-facing skill tool rather
      // than a server command, so an explicit instruction works across v1 and
      // the newer slash-capable runtime.
      return `Use the \`${skillName}\` skill. `;
  }
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
      invocation: getSkillInvocation(agentId, name),
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
    options.homePath ?? homedir(),
  );
  const discovered = await Promise.all(
    roots.map((rootPath) => readSkillRoot(rootPath, agentId)),
  );
  const byName = new Map<string, AgentSlashCommand>();

  // Roots are ordered from broad to specific, so later definitions override
  // global or cross-agent definitions with the same skill name.
  for (const skills of discovered) {
    for (const skill of skills) {
      byName.set(skill.name, skill);
    }
  }

  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
