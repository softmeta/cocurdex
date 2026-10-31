import path from "node:path";
import type {
  SkillLibraryScope,
  SkillLinkAgent,
  SkillRootId,
} from "@cocurdex/shared";

export interface SkillLocationEnv {
  home: string;
  claudeConfigDir?: string | null;
  codexHome?: string | null;
  xdgConfigHome?: string | null;
  xdgStateHome?: string | null;
}

export interface SkillRootLocation {
  id: SkillRootId;
  dir: string;
}

export function skillLocationEnvFromProcess(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): SkillLocationEnv {
  return {
    home,
    claudeConfigDir: env.CLAUDE_CONFIG_DIR?.trim() || null,
    codexHome: env.CODEX_HOME?.trim() || null,
    xdgConfigHome: env.XDG_CONFIG_HOME?.trim() || null,
    xdgStateHome: env.XDG_STATE_HOME?.trim() || null,
  };
}

function globalRoots(env: SkillLocationEnv): SkillRootLocation[] {
  const claudeHome = env.claudeConfigDir || path.join(env.home, ".claude");
  const codexHome = env.codexHome || path.join(env.home, ".codex");
  const configHome = env.xdgConfigHome || path.join(env.home, ".config");
  return [
    { id: "agents", dir: path.join(env.home, ".agents", "skills") },
    { id: "claude", dir: path.join(claudeHome, "skills") },
    { id: "codex", dir: path.join(codexHome, "skills") },
    { id: "opencode", dir: path.join(configHome, "opencode", "skills") },
    { id: "cursor", dir: path.join(env.home, ".cursor", "skills") },
    {
      id: "antigravity",
      dir: path.join(env.home, ".gemini", "antigravity", "skills"),
    },
  ];
}

function workspaceRoots(workspaceRoot: string): SkillRootLocation[] {
  const root = path.resolve(workspaceRoot);
  return [
    { id: "agents", dir: path.join(root, ".agents", "skills") },
    { id: "claude", dir: path.join(root, ".claude", "skills") },
    { id: "codex", dir: path.join(root, ".codex", "skills") },
    { id: "opencode", dir: path.join(root, ".opencode", "skills") },
    { id: "cursor", dir: path.join(root, ".cursor", "skills") },
  ];
}

export function skillRoots(
  scope: SkillLibraryScope,
  env: SkillLocationEnv,
  workspaceRoot?: string | null,
): SkillRootLocation[] {
  if (scope === "global") {
    return globalRoots(env);
  }
  if (!workspaceRoot) {
    throw new Error("Workspace scope requires a workspace root");
  }
  return workspaceRoots(workspaceRoot);
}

const LINK_AGENT_ROOTS: Record<SkillLinkAgent, SkillRootId> = {
  "claude-code": "claude",
  antigravity: "antigravity",
};

export function linkAgentRoot(agent: SkillLinkAgent): SkillRootId {
  return LINK_AGENT_ROOTS[agent];
}

export function rootDir(roots: SkillRootLocation[], id: SkillRootId) {
  const root = roots.find((candidate) => candidate.id === id);
  if (!root) {
    throw new Error(`Skill root ${id} is not available in this scope`);
  }
  return root.dir;
}

export function globalSkillLockPath(env: SkillLocationEnv) {
  if (env.xdgStateHome) {
    return path.join(env.xdgStateHome, "skills", ".skill-lock.json");
  }
  return path.join(env.home, ".agents", ".skill-lock.json");
}

export function projectSkillLockPath(workspaceRoot: string) {
  return path.join(path.resolve(workspaceRoot), "skills-lock.json");
}
