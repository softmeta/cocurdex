export type ProductSkillScope = "project" | "global";

export interface ProductSkillsRequestPayload {
  scope: ProductSkillScope;
  workspaceRootPath?: string | null;
}

/** Install status for the bundled cocurdex-* agent skill pack. */
export interface ProductSkillsStatusResult {
  scope: ProductSkillScope;
  packVersion: string;
  installed: boolean;
  managed: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
  conflict: boolean;
  conflictSkills: string[];
  skills: string[];
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  claudeLinkMode: "symlink" | "copy" | "none";
  workspaceRoot: string | null;
  sourceAvailable: boolean;
  sourceRoot: string;
}

export interface ProductSkillsInstallResult extends ProductSkillsStatusResult {
  action: "installed" | "updated" | "skipped" | "conflict";
}

export interface ProductSkillsRemoveResult {
  scope: ProductSkillScope;
  removed: boolean;
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  removedSkills: string[];
}
