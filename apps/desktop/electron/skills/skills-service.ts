import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsStatus,
  type InstallProductSkillsResult,
  installProductSkills,
  type ProductSkillsStatus,
  type RemoveProductSkillsResult,
  removeProductSkills,
  type SkillScope,
} from "@cocurdex/product-skills";
import { app, ipcMain } from "electron";
import { createLogger } from "../logging";

const logger = createLogger("product-skills");

export type SkillsStatusPayload = ProductSkillsStatus & {
  sourceAvailable: boolean;
  sourceRoot: string;
};

function desktopRootFromModule(): string {
  // electron/skills -> apps/desktop
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function getBundledSkillsSourceRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "skills");
  }
  // Dev: monorepo package source
  return path.join(
    desktopRootFromModule(),
    "../../packages/product-skills/skills",
  );
}

function sourceOptions() {
  const sourceRoot = getBundledSkillsSourceRoot();
  return {
    sourceRoot: sourceRoot || getDefaultSkillsSourceRoot(),
  };
}

export async function readSkillsStatus(
  scope: SkillScope,
  workspaceRootPath?: string | null,
): Promise<SkillsStatusPayload> {
  const sourceRoot = getBundledSkillsSourceRoot();
  const status = await getProductSkillsStatus(
    scope,
    workspaceRootPath ?? undefined,
    sourceOptions(),
  );
  return {
    ...status,
    sourceAvailable: Boolean(sourceRoot),
    sourceRoot,
  };
}

export async function installSkills(
  scope: SkillScope,
  workspaceRootPath?: string | null,
): Promise<InstallProductSkillsResult & { sourceRoot: string }> {
  const sourceRoot = getBundledSkillsSourceRoot();
  const result = await installProductSkills(
    scope,
    workspaceRootPath ?? undefined,
    sourceOptions(),
  );
  logger.info("skills.install", {
    scope,
    action: result.action,
    workspaceRootPath: workspaceRootPath ?? null,
    packVersion: result.packVersion,
  });
  return { ...result, sourceRoot };
}

export async function removeSkills(
  scope: SkillScope,
  workspaceRootPath?: string | null,
): Promise<RemoveProductSkillsResult> {
  const result = await removeProductSkills(
    scope,
    workspaceRootPath ?? undefined,
    sourceOptions(),
  );
  logger.info("skills.remove", {
    scope,
    removed: result.removed,
    workspaceRootPath: workspaceRootPath ?? null,
  });
  return result;
}

export function registerSkillsHandlers(): void {
  ipcMain.handle(
    "skills:getStatus",
    async (
      _event,
      payload: { scope: SkillScope; workspaceRootPath?: string | null },
    ) => readSkillsStatus(payload.scope, payload.workspaceRootPath),
  );
  ipcMain.handle(
    "skills:install",
    async (
      _event,
      payload: { scope: SkillScope; workspaceRootPath?: string | null },
    ) => installSkills(payload.scope, payload.workspaceRootPath),
  );
  ipcMain.handle(
    "skills:remove",
    async (
      _event,
      payload: { scope: SkillScope; workspaceRootPath?: string | null },
    ) => removeSkills(payload.scope, payload.workspaceRootPath),
  );
}
