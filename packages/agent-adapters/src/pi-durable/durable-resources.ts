import { readFileSync } from "node:fs";
import {
  DefaultResourceLoader,
  formatSkillsForPrompt,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { logAdapterDiagnostic } from "../diagnostics";
import { resolveAdditionalSkillPaths } from "../pi-sdk/pi-skill-diagnostics";

export interface WorkspaceResources {
  skills: Skill[];
  contextFiles: Array<{ path: string; content: string }>;
}

const EMPTY: WorkspaceResources = { skills: [], contextFiles: [] };

/**
 * Skills and AGENTS.md files of one working directory, loaded the way pi's coding agent loads
 * them so a durable conversation sees the same skills a `/skill:` invocation lists.
 */
export class WorkspaceResourceCache {
  private readonly loaded = new Map<string, Promise<WorkspaceResources>>();

  constructor(private readonly agentDir: string) {}

  /** Reloads `cwd` so a run sees skills and context files edited since the last one. */
  refresh(cwd: string) {
    const next = this.load(cwd);
    this.loaded.set(cwd, next);
    return next;
  }

  get(cwd: string) {
    return this.loaded.get(cwd) ?? this.refresh(cwd);
  }

  private async load(cwd: string): Promise<WorkspaceResources> {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: this.agentDir,
      additionalSkillPaths: resolveAdditionalSkillPaths(cwd),
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    try {
      await loader.reload();
    } catch (error) {
      logAdapterDiagnostic("info", "pi-durable: resource reload failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return EMPTY;
    }
    return {
      skills: loader.getSkills().skills,
      contextFiles: loader.getAgentsFiles().agentsFiles,
    };
  }
}

export function renderSkillsSection(skills: Skill[]) {
  const text = formatSkillsForPrompt(skills, "read").trim();
  return text || undefined;
}

export function renderProjectContextSection(
  contextFiles: WorkspaceResources["contextFiles"],
) {
  if (contextFiles.length === 0) return undefined;
  return [
    "Project-specific instructions and guidelines:",
    ...contextFiles.map(
      ({ path, content }) =>
        `<project_instructions path="${path}">\n${content}\n</project_instructions>`,
    ),
  ].join("\n\n");
}

function stripFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---", 4);
  return end === -1 ? normalized : normalized.slice(end + 4);
}

/** Expands `/skill:name args` into the skill's instructions, as pi's coding agent does. */
export function expandSkillCommand(text: string, skills: readonly Skill[]) {
  if (!text.startsWith("/skill:")) return text;
  const spaceIndex = text.indexOf(" ");
  const name = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
  const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) return text;
  try {
    const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
    const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
    return args ? `${block}\n\n${args}` : block;
  } catch (error) {
    logAdapterDiagnostic("info", "pi-durable: skill expansion failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return text;
  }
}
