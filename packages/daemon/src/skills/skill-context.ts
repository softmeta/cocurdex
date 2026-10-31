import path from "node:path";
import type {
  SkillLibraryScope,
  SkillRef,
  SkillTarget,
  SkillWorkspaceInfo,
} from "@cocurdex/shared";
import {
  globalSkillLockPath,
  projectSkillLockPath,
  type SkillLocationEnv,
  type SkillRootLocation,
  skillRoots,
} from "./skill-locations";
import { readSkillLock, type SkillLockFile } from "./skill-locks";

export type WorkspaceResolver = (
  workspaceId: string,
) => Promise<SkillWorkspaceInfo | null>;

export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}

export interface ScopeContext {
  scope: SkillLibraryScope;
  workspace: SkillWorkspaceInfo | null;
  roots: SkillRootLocation[];
  lockPath: string;
  lockKind: SkillLockFile["kind"];
}

export async function resolveScopeContext(
  target: SkillTarget,
  env: SkillLocationEnv,
  resolveWorkspace: WorkspaceResolver,
): Promise<ScopeContext> {
  if (target.scope === "global") {
    return {
      scope: "global",
      workspace: null,
      roots: skillRoots("global", env),
      lockPath: globalSkillLockPath(env),
      lockKind: "global",
    };
  }
  if (!target.workspaceId) {
    throw new Error("Workspace scope requires a workspace");
  }
  const workspace = await resolveWorkspace(target.workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${target.workspaceId}`);
  }
  return {
    scope: "workspace",
    workspace,
    roots: skillRoots("workspace", env, workspace.rootPath),
    lockPath: projectSkillLockPath(workspace.rootPath),
    lockKind: "project",
  };
}

export function readScopeLock(context: ScopeContext) {
  return readSkillLock(context.lockKind, context.lockPath);
}

export function refIn(context: ScopeContext, name: string): SkillRef {
  return {
    scope: context.scope,
    workspaceId: context.workspace?.id ?? null,
    name,
  };
}

export function skillKey(ref: SkillRef) {
  return `${ref.scope}:${ref.workspaceId ?? ""}:${ref.name}`;
}

export function scopeLabel(context: ScopeContext) {
  return context.workspace
    ? `workspace-${path.basename(context.workspace.rootPath)}`
    : "global";
}
