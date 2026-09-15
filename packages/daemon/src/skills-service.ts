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
import { logDaemonDiagnostic } from "./diagnostics";

export class DaemonSkillsService {
  private readonly sourceRoot: string;

  constructor(sourceRoot = getDefaultSkillsSourceRoot()) {
    this.sourceRoot = sourceRoot;
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
    const result = await installProductSkills(
      payload.scope,
      payload.workspaceRootPath ?? undefined,
      { sourceRoot: this.sourceRoot },
    );
    logDaemonDiagnostic("info", "skills.install", {
      scope: payload.scope,
      action: result.action,
      workspaceRootPath: payload.workspaceRootPath ?? null,
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
    const result = await removeProductSkills(
      payload.scope,
      payload.workspaceRootPath ?? undefined,
      { sourceRoot: this.sourceRoot },
    );
    logDaemonDiagnostic("info", "skills.remove", {
      scope: payload.scope,
      removed: result.removed,
      workspaceRootPath: payload.workspaceRootPath ?? null,
    });
    return result;
  }
}
