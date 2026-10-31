export type SkillLibraryScope = "global" | "workspace";

export interface SkillTarget {
  scope: SkillLibraryScope;
  workspaceId?: string | null;
}

export interface SkillRef extends SkillTarget {
  name: string;
}

export type SkillRootId =
  | "agents"
  | "claude"
  | "codex"
  | "opencode"
  | "cursor"
  | "antigravity";

export const SKILL_LINK_AGENTS = ["claude-code", "antigravity"] as const;

export type SkillLinkAgent = (typeof SKILL_LINK_AGENTS)[number];

export function skillLinkAgentsForScope(
  scope: SkillLibraryScope,
): SkillLinkAgent[] {
  return scope === "global" ? ["claude-code", "antigravity"] : ["claude-code"];
}

export type SkillAgentAccess = "native" | "home" | "link" | "copy" | "none";

export interface SkillAgentVisibility {
  agent: "shared" | SkillLinkAgent;
  access: SkillAgentAccess;
  path: string | null;
  toggleable: boolean;
}

export type SkillManifestIssue =
  | "missingFrontmatter"
  | "missingName"
  | "invalidName"
  | "nameTooLong"
  | "nameMismatch"
  | "missingDescription"
  | "descriptionTooLong";

export interface SkillCopy {
  root: SkillRootId;
  path: string;
  contentHash: string;
  modifiedAt: string | null;
  fileCount: number;
}

export type SkillProblem =
  | { kind: "invalid"; issues: SkillManifestIssue[] }
  | { kind: "duplicate"; copies: SkillCopy[] }
  | { kind: "brokenLink"; path: string };

export type SkillSourceKind = "github" | "local" | "other";

export interface SkillSourceInfo {
  kind: SkillSourceKind;
  source: string;
  url: string | null;
  skillPath: string | null;
  ref: string | null;
  installedAt: string | null;
  updatedAt: string | null;
}

export interface SkillUpdateInfo {
  latestCommit: string;
  checkedAt: string;
  skipped: boolean;
}

export interface InstalledSkill {
  name: string;
  scope: SkillLibraryScope;
  workspaceId: string | null;
  description: string | null;
  path: string;
  root: SkillRootId;
  builtin: boolean;
  source: SkillSourceInfo | null;
  agents: SkillAgentVisibility[];
  problems: SkillProblem[];
  fileCount: number;
  scriptCount: number;
  update: SkillUpdateInfo | null;
}

export interface SkillWorkspaceInfo {
  id: string;
  name: string;
  rootPath: string;
}

export interface SkillLibraryList {
  skills: InstalledSkill[];
  workspace: SkillWorkspaceInfo | null;
}

export type SkillFileKind = "skill" | "doc" | "script" | "asset";

export interface SkillFileEntry {
  path: string;
  size: number;
  kind: SkillFileKind;
}

export interface SkillDocument {
  content: string;
  truncated: boolean;
  license: string | null;
}

export interface InstalledSkillDetail {
  skill: InstalledSkill;
  files: SkillFileEntry[];
  document: SkillDocument | null;
}

export interface SkillCatalogResult {
  id: string;
  source: string;
  skillId: string;
  name: string;
  installs: number;
}

export interface SkillCatalogSearchResult {
  query: string;
  results: SkillCatalogResult[];
}

export interface SkillCatalogSource {
  source: string;
  title: string;
  description: string;
  url: string;
}

export type SkillAuditRisk = "safe" | "low" | "medium" | "high" | "critical";

export interface SkillAuditFinding {
  provider: "ath" | "socket" | "snyk";
  risk: SkillAuditRisk;
  analyzedAt: string | null;
}

export interface SkillAudit {
  skillId: string;
  findings: SkillAuditFinding[];
}

export interface SkillSourceSkill {
  name: string;
  skillPath: string;
  description: string | null;
  issues: SkillManifestIssue[];
  installable: boolean;
  fileCount: number;
  scriptCount: number;
}

export interface SkillSourceSnapshot {
  kind: SkillSourceKind;
  source: string;
  url: string | null;
  ref: string | null;
  commit: string | null;
  skills: SkillSourceSkill[];
}

export interface SkillSourceSkillDetail {
  source: SkillSourceSnapshot;
  skill: SkillSourceSkill;
  files: SkillFileEntry[];
  document: SkillDocument | null;
}

export interface SkillAddRequest extends SkillTarget {
  source: string;
  ref?: string | null;
  skillPaths: string[];
  agents: SkillLinkAgent[];
  replace: string[];
}

export interface SkillAddResult {
  installed: string[];
  skipped: Array<{ name: string; reason: "exists" | "invalid" }>;
}

export interface SkillUpdateCandidate extends SkillRef {
  source: string;
  currentHash: string | null;
  latestCommit: string;
  skipped: boolean;
}

export interface SkillUpdateCheckResult {
  checkedAt: string;
  updates: SkillUpdateCandidate[];
  failures: Array<{ source: string; error: string }>;
}

export type SkillFileChangeStatus = "added" | "removed" | "modified";

export interface SkillFileChange {
  path: string;
  status: SkillFileChangeStatus;
  kind: SkillFileKind;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface SkillUpdatePreview extends SkillRef {
  source: string;
  latestCommit: string;
  localModified: boolean | null;
  changes: SkillFileChange[];
}

export interface SkillListPayload {
  workspaceId?: string | null;
}

export interface SkillAgentLinkPayload extends SkillRef {
  agent: SkillLinkAgent;
  enabled: boolean;
}

export interface SkillResolveDuplicatePayload extends SkillRef {
  keepPath: string;
}

export interface SkillCatalogSearchPayload {
  query: string;
  limit?: number;
}

export interface SkillCatalogSourcesResult {
  sources: SkillCatalogSource[];
}

export interface SkillCatalogAuditPayload {
  source: string;
  skillIds: string[];
}

export interface SkillCatalogAuditResult {
  audits: SkillAudit[];
}

export interface SkillSourceInspectPayload {
  source: string;
  ref?: string | null;
}

export interface SkillSourceShowPayload extends SkillSourceInspectPayload {
  skillPath: string;
}

export interface SkillRemoveResult {
  removed: boolean;
}

export interface SkillUpdatesApplyPayload {
  skills: SkillRef[];
}

export interface SkillUpdatesApplyResult {
  updated: string[];
}

export interface SkillUpdateSkipPayload extends SkillRef {
  latestCommit: string;
}

export interface SkillUpdateSkipResult {
  skipped: boolean;
}
