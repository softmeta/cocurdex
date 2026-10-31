import type { SkillDocument, SkillFileEntry } from "./skill-library";

export type ProductSkillScope = "project" | "global";

export interface ProductSkillsRequestPayload {
  scope: ProductSkillScope;
  workspaceRootPath?: string | null;
}

export interface ProductSkillInfo {
  name: string;
  description: string | null;
}

export interface ProductSkillShowPayload {
  name: string;
}

export interface ProductSkillDetail {
  skill: ProductSkillInfo;
  files: SkillFileEntry[];
  document: SkillDocument | null;
}

/** Install status for the bundled cocurdex-* agent skill pack. */
export interface ProductSkillsStatusResult {
  scope: ProductSkillScope;
  packVersion: string;
  installed: boolean;
  managed: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
  modified: boolean;
  conflict: boolean;
  conflictSkills: string[];
  skills: string[];
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  claudeLinkMode: "symlink" | "copy" | "none";
  workspaceRoot: string | null;
  sourceAvailable: boolean;
  sourceRoot: string;
  packSkills: ProductSkillInfo[];
}

export interface ProductSkillsInstallResult extends ProductSkillsStatusResult {
  action: "installed" | "updated" | "restored" | "skipped" | "conflict";
}

export interface ProductSkillsRemoveResult {
  scope: ProductSkillScope;
  removed: boolean;
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  removedSkills: string[];
}
