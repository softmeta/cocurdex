import { access } from "node:fs/promises";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsStatus,
  installProductSkills,
  removeProductSkills,
} from "@cocurdex/product-skills";
import type {
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsRequestPayload,
  ProductSkillsStatusResult,
} from "@cocurdex/shared";
import { hashLogValue } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";

export class DaemonSkillsService {
  private readonly sourceRoot: string;

  constructor(
    sourceRoot = getDefaultSkillsSourceRoot(),
    private readonly canScanRoot: (
      rootPath: string,
    ) => Promise<boolean> = async () => false,
  ) {
    this.sourceRoot = sourceRoot;
  }

  // Project scope writes into <root>/.claude/skills, so the target must be a
  // registered workspace/worktree — never a client-supplied arbitrary path.
  private async requireAuthorizedProjectRoot(
    payload: ProductSkillsRequestPayload,
  ) {
    if (payload.scope !== "project") {
      return;
    }
    const workspaceRootPath = payload.workspaceRootPath;
    if (!workspaceRootPath || !(await this.canScanRoot(workspaceRootPath))) {
      throw new Error(
        `Project skills target is not a registered workspace (path=${workspaceRootPath ?? "none"})`,
      );
    }
  }

  private async sourceIsAvailable() {
    try {
      await access(this.sourceRoot);
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(
    payload: ProductSkillsRequestPayload,
  ): Promise<ProductSkillsStatusResult> {
    await this.requireAuthorizedProjectRoot(payload);
    const status = await getProductSkillsStatus(
      payload.scope,
      payload.workspaceRootPath ?? undefined,
      { sourceRoot: this.sourceRoot },
    );
    return {
      ...status,
      sourceAvailable: await this.sourceIsAvailable(),
      sourceRoot: this.sourceRoot,
    };
  }

  async install(
    payload: ProductSkillsRequestPayload,
  ): Promise<ProductSkillsInstallResult> {
    await this.requireAuthorizedProjectRoot(payload);
    const result = await installProductSkills(
      payload.scope,
      payload.workspaceRootPath ?? undefined,
      { sourceRoot: this.sourceRoot },
    );
    logDaemonDiagnostic("info", "skills.install", {
      scope: payload.scope,
      action: result.action,
      workspaceHash: hashLogValue(payload.workspaceRootPath),
      packVersion: result.packVersion,
    });
    return {
      ...result,
      sourceAvailable: await this.sourceIsAvailable(),
      sourceRoot: this.sourceRoot,
    };
  }

  async remove(
    payload: ProductSkillsRequestPayload,
  ): Promise<ProductSkillsRemoveResult> {
    await this.requireAuthorizedProjectRoot(payload);
    const result = await removeProductSkills(
      payload.scope,
      payload.workspaceRootPath ?? undefined,
      { sourceRoot: this.sourceRoot },
    );
    logDaemonDiagnostic("info", "skills.remove", {
      scope: payload.scope,
      removed: result.removed,
      workspaceHash: hashLogValue(payload.workspaceRootPath),
    });
    return result;
  }
}
