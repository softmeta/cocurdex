import {
  type InstalledSkill,
  type SkillLibraryScope,
  type SkillLinkAgent,
  type SkillRef,
  type SkillSourceInfo,
  skillLinkAgentsForScope,
} from "@cocurdex/shared";

export type SkillSelection =
  | { kind: "pack" }
  | { kind: "packSkill"; name: string }
  | { kind: "skill"; key: string };

export type SkillDotState = "ok" | "update" | "problem";

export interface InstalledSkillGroups {
  builtin: InstalledSkill[];
  global: InstalledSkill[];
  workspace: InstalledSkill[];
  problems: InstalledSkill[];
}

export function skillRef(skill: InstalledSkill): SkillRef {
  return {
    scope: skill.scope,
    workspaceId: skill.workspaceId,
    name: skill.name,
  };
}

export function skillKey(ref: SkillRef) {
  return `${ref.scope}:${ref.workspaceId ?? ""}:${ref.name}`;
}

export function hasPendingUpdate(skill: InstalledSkill) {
  return Boolean(skill.update && !skill.update.skipped);
}

export function isBrokenLinkOnly(skill: InstalledSkill) {
  return (
    skill.agents.length === 0 &&
    skill.problems.some((problem) => problem.kind === "brokenLink")
  );
}

export function skillDotState(skill: InstalledSkill): SkillDotState {
  if (skill.problems.length > 0) {
    return "problem";
  }
  return hasPendingUpdate(skill) ? "update" : "ok";
}

function matchesQuery(skill: InstalledSkill, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [skill.name, skill.description, skill.source?.source].some((value) =>
    value?.toLowerCase().includes(needle),
  );
}

export function groupInstalledSkills(
  skills: InstalledSkill[],
  query: string,
): InstalledSkillGroups {
  const groups: InstalledSkillGroups = {
    builtin: [],
    global: [],
    workspace: [],
    problems: [],
  };
  for (const skill of skills) {
    if (skill.builtin) {
      groups.builtin.push(skill);
      continue;
    }
    if (!matchesQuery(skill, query)) {
      continue;
    }
    if (skill.problems.length > 0) {
      groups.problems.push(skill);
    } else {
      groups[skill.scope].push(skill);
    }
  }
  return groups;
}

export function sourceDisplay(source: SkillSourceInfo | null) {
  if (!source) {
    return null;
  }
  if (source.kind === "github" && source.skillPath) {
    const folder = source.skillPath.replace(/\/?SKILL\.md$/, "");
    return folder ? `${source.source} · ${folder}` : source.source;
  }
  return source.source;
}

export function shortCommit(commit: string | null | undefined) {
  return commit ? commit.slice(0, 7) : null;
}

export function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SkillInstallChoice {
  scope: SkillLibraryScope;
  agents: SkillLinkAgent[];
}

export function defaultInstallChoice(): SkillInstallChoice {
  return { scope: "global", agents: ["claude-code"] };
}

export function installAgents(choice: SkillInstallChoice) {
  const allowed = skillLinkAgentsForScope(choice.scope);
  return choice.agents.filter((agent) => allowed.includes(agent));
}

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

export function skillDocumentBody(content: string) {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) {
    return content;
  }
  return content.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "");
}
