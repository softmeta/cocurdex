import path from "node:path";
import type { SkillScope } from "./manifest";

export function resolveAgentsSkillsDir(
  scope: SkillScope,
  options: { workspaceRoot?: string; home: string },
): string {
  if (scope === "global") {
    return path.join(options.home, ".agents", "skills");
  }
  const root = options.workspaceRoot;
  if (!root) {
    throw new Error("Project scope requires a workspace root path");
  }
  return path.join(path.resolve(root), ".agents", "skills");
}

export function resolveClaudeSkillsDir(
  scope: SkillScope,
  options: { workspaceRoot?: string; home: string },
): string {
  if (scope === "global") {
    return path.join(options.home, ".claude", "skills");
  }
  const root = options.workspaceRoot;
  if (!root) {
    throw new Error("Project scope requires a workspace root path");
  }
  return path.join(path.resolve(root), ".claude", "skills");
}
