import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsPackVersion,
  MANAGED_MARKER_FILENAME,
  type ManagedSkillsMarker,
  PRODUCT_SKILL_NAMES,
  type SkillScope,
} from "./manifest";
import { resolveAgentsSkillsDir, resolveClaudeSkillsDir } from "./paths";

export type ClaudeLinkMode = "symlink" | "copy" | "none";

export type ProductSkillsStatus = {
  scope: SkillScope;
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
  claudeLinkMode: ClaudeLinkMode;
  workspaceRoot: string | null;
};

export type InstallProductSkillsResult = ProductSkillsStatus & {
  action: "installed" | "updated" | "skipped" | "conflict";
};

export type RemoveProductSkillsResult = {
  scope: SkillScope;
  removed: boolean;
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  removedSkills: string[];
};

export type ProductSkillsIoOptions = {
  home?: string;
  sourceRoot?: string;
  packVersion?: string;
  /** Force copy into .claude/skills instead of symlink (tests / Windows). */
  preferClaudeCopy?: boolean;
};

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function resolveHome(options?: ProductSkillsIoOptions): string {
  return options?.home ?? homedir();
}

function resolveSourceRoot(options?: ProductSkillsIoOptions): string {
  return options?.sourceRoot ?? getDefaultSkillsSourceRoot();
}

function resolvePackVersion(options?: ProductSkillsIoOptions): string {
  return options?.packVersion ?? getProductSkillsPackVersion();
}

function markerPath(agentsSkillsDir: string): string {
  return path.join(agentsSkillsDir, MANAGED_MARKER_FILENAME);
}

async function readMarker(
  agentsSkillsDir: string,
): Promise<ManagedSkillsMarker | null> {
  const filePath = markerPath(agentsSkillsDir);
  if (!(await pathExists(filePath))) {
    return null;
  }
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ManagedSkillsMarker;
    if (parsed.managedBy !== "cocurdex" || !Array.isArray(parsed.skills)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeMarker(
  agentsSkillsDir: string,
  marker: ManagedSkillsMarker,
): Promise<void> {
  await mkdir(agentsSkillsDir, { recursive: true });
  await writeFile(
    markerPath(agentsSkillsDir),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );
}

async function listPresentProductSkills(
  agentsSkillsDir: string,
): Promise<string[]> {
  if (!(await pathExists(agentsSkillsDir))) {
    return [];
  }
  const entries = await readdir(agentsSkillsDir, { withFileTypes: true });
  const names = new Set(PRODUCT_SKILL_NAMES as readonly string[]);
  return entries
    .filter(
      (entry) =>
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        names.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
}

async function detectClaudeLinkMode(
  claudeSkillsDir: string,
  skillName: string,
): Promise<ClaudeLinkMode> {
  const claudeTarget = path.join(claudeSkillsDir, skillName);
  if (!(await pathExists(claudeTarget))) {
    return "none";
  }
  try {
    const stat = await lstat(claudeTarget);
    if (stat.isSymbolicLink()) {
      return "symlink";
    }
    return "copy";
  } catch {
    return "none";
  }
}

export async function getProductSkillsStatus(
  scope: SkillScope,
  workspaceRoot?: string,
  options?: ProductSkillsIoOptions,
): Promise<ProductSkillsStatus> {
  const home = resolveHome(options);
  const packVersion = resolvePackVersion(options);
  const agentsSkillsDir = resolveAgentsSkillsDir(scope, {
    workspaceRoot,
    home,
  });
  const claudeSkillsDir = resolveClaudeSkillsDir(scope, {
    workspaceRoot,
    home,
  });
  const marker = await readMarker(agentsSkillsDir);
  const present = await listPresentProductSkills(agentsSkillsDir);
  const managed = marker !== null;
  // Same-named product skills without a managed marker are treated as foreign.
  const conflictSkills = managed ? [] : present;

  const installedVersion = marker?.packVersion ?? null;
  const installed = managed && present.length > 0;
  const updateAvailable =
    installed && installedVersion !== null && installedVersion !== packVersion;

  let claudeLinkMode: ClaudeLinkMode = "none";
  if (present[0]) {
    claudeLinkMode = await detectClaudeLinkMode(claudeSkillsDir, present[0]);
  }

  return {
    scope,
    packVersion,
    installed,
    managed,
    installedVersion,
    updateAvailable,
    conflict: conflictSkills.length > 0,
    conflictSkills,
    skills: managed ? [...(marker?.skills ?? [])].sort() : present,
    agentsSkillsDir,
    claudeSkillsDir,
    claudeLinkMode,
    workspaceRoot:
      scope === "project" ? path.resolve(workspaceRoot ?? "") : null,
  };
}

async function copySkillDirectory(
  sourceSkillDir: string,
  destSkillDir: string,
): Promise<void> {
  await rm(destSkillDir, { recursive: true, force: true });
  await mkdir(path.dirname(destSkillDir), { recursive: true });
  await cp(sourceSkillDir, destSkillDir, { recursive: true });
}

async function linkOrCopyClaudeSkill(
  agentsSkillDir: string,
  claudeSkillDir: string,
  preferCopy: boolean,
): Promise<ClaudeLinkMode> {
  await mkdir(path.dirname(claudeSkillDir), { recursive: true });
  await rm(claudeSkillDir, { recursive: true, force: true });

  if (!preferCopy) {
    try {
      const relativeTarget = path.relative(
        path.dirname(claudeSkillDir),
        agentsSkillDir,
      );
      await symlink(relativeTarget, claudeSkillDir, "dir");
      return "symlink";
    } catch {
      // Fall through to copy (common on Windows without privilege).
    }
  }

  await cp(agentsSkillDir, claudeSkillDir, { recursive: true });
  return "copy";
}

export async function installProductSkills(
  scope: SkillScope,
  workspaceRoot?: string,
  options?: ProductSkillsIoOptions,
): Promise<InstallProductSkillsResult> {
  const home = resolveHome(options);
  const packVersion = resolvePackVersion(options);
  const sourceRoot = resolveSourceRoot(options);
  const agentsSkillsDir = resolveAgentsSkillsDir(scope, {
    workspaceRoot,
    home,
  });
  const claudeSkillsDir = resolveClaudeSkillsDir(scope, {
    workspaceRoot,
    home,
  });

  const before = await getProductSkillsStatus(scope, workspaceRoot, options);
  if (before.conflict) {
    return {
      ...before,
      action: "conflict",
    };
  }

  if (
    before.installed &&
    before.installedVersion === packVersion &&
    !before.updateAvailable
  ) {
    return {
      ...before,
      action: "skipped",
    };
  }

  const action: InstallProductSkillsResult["action"] = before.installed
    ? "updated"
    : "installed";

  let claudeLinkMode: ClaudeLinkMode = "none";

  for (const skillName of PRODUCT_SKILL_NAMES) {
    const sourceSkillDir = path.join(sourceRoot, skillName);
    if (!(await pathExists(sourceSkillDir))) {
      throw new Error(
        `Missing packaged skill: ${skillName} (${sourceSkillDir})`,
      );
    }
    const agentsSkillDir = path.join(agentsSkillsDir, skillName);
    await copySkillDirectory(sourceSkillDir, agentsSkillDir);
    claudeLinkMode = await linkOrCopyClaudeSkill(
      agentsSkillDir,
      path.join(claudeSkillsDir, skillName),
      Boolean(options?.preferClaudeCopy),
    );
  }

  const installedAt = new Date().toISOString();
  await writeMarker(agentsSkillsDir, {
    managedBy: "cocurdex",
    packVersion,
    skills: [...PRODUCT_SKILL_NAMES],
    scope,
    installedAt,
  });

  const after = await getProductSkillsStatus(scope, workspaceRoot, {
    ...options,
    packVersion,
  });

  return {
    ...after,
    claudeLinkMode:
      claudeLinkMode === "none" ? after.claudeLinkMode : claudeLinkMode,
    action,
  };
}

export async function removeProductSkills(
  scope: SkillScope,
  workspaceRoot?: string,
  options?: ProductSkillsIoOptions,
): Promise<RemoveProductSkillsResult> {
  const home = resolveHome(options);
  const agentsSkillsDir = resolveAgentsSkillsDir(scope, {
    workspaceRoot,
    home,
  });
  const claudeSkillsDir = resolveClaudeSkillsDir(scope, {
    workspaceRoot,
    home,
  });

  const marker = await readMarker(agentsSkillsDir);
  const toRemove = marker?.skills?.length
    ? marker.skills
    : [...PRODUCT_SKILL_NAMES];

  const removedSkills: string[] = [];
  for (const skillName of toRemove) {
    const agentsSkillDir = path.join(agentsSkillsDir, skillName);
    const claudeSkillDir = path.join(claudeSkillsDir, skillName);
    if (await pathExists(agentsSkillDir)) {
      await rm(agentsSkillDir, { recursive: true, force: true });
      removedSkills.push(skillName);
    }
    if (await pathExists(claudeSkillDir)) {
      await rm(claudeSkillDir, { recursive: true, force: true });
    }
  }

  const markerFile = markerPath(agentsSkillsDir);
  if (await pathExists(markerFile)) {
    await rm(markerFile, { force: true });
  }

  return {
    scope,
    removed: removedSkills.length > 0 || marker !== null,
    agentsSkillsDir,
    claudeSkillsDir,
    removedSkills,
  };
}
