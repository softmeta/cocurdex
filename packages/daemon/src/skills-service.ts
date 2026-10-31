import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsStatus,
  installProductSkills,
  PRODUCT_SKILL_NAMES,
  removeProductSkills,
} from "@cocurdex/product-skills";
import type {
  ProductSkillDetail,
  ProductSkillInfo,
  ProductSkillShowPayload,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsRequestPayload,
  ProductSkillsStatusResult,
} from "@cocurdex/shared";
import { hashLogValue } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";
import { readSkillDocument } from "./skills/skill-document";
import { listSkillFiles, toSkillFileEntries } from "./skills/skill-files";
import { parseSkillManifest } from "./skills/skill-manifest";

const PACK_SKILL_NAMES: ReadonlySet<string> = new Set(PRODUCT_SKILL_NAMES);

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

  private async readPackSkills(): Promise<ProductSkillInfo[]> {
    const skills = await Promise.all(
      PRODUCT_SKILL_NAMES.map(
        async (name): Promise<ProductSkillInfo | null> => {
          const content = await readFile(
            path.join(this.sourceRoot, name, "SKILL.md"),
            "utf8",
          ).catch(() => null);
          if (content === null) {
            return null;
          }
          return {
            name,
            description: parseSkillManifest(content, name).description,
          };
        },
      ),
    );
    return skills.filter((skill): skill is ProductSkillInfo => skill !== null);
  }

  private async sourceInfo() {
    const packSkills = await this.readPackSkills();
    return {
      sourceAvailable: packSkills.length === PRODUCT_SKILL_NAMES.length,
      sourceRoot: this.sourceRoot,
      packSkills,
    };
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
      ...(await this.sourceInfo()),
    };
  }

  async show({ name }: ProductSkillShowPayload): Promise<ProductSkillDetail> {
    if (!PACK_SKILL_NAMES.has(name)) {
      throw new Error(`${name} is not a Cocurdex pack skill`);
    }
    const skillDir = path.join(this.sourceRoot, name);
    const [document, files] = await Promise.all([
      readSkillDocument(skillDir),
      listSkillFiles(skillDir).catch(() => []),
    ]);
    return {
      skill: {
        name,
        description: document
          ? parseSkillManifest(document.content, name).description
          : null,
      },
      files: toSkillFileEntries(files),
      document,
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
      ...(await this.sourceInfo()),
    };
  }

  async refreshManagedGlobalInstall(): Promise<void> {
    try {
      const status = await getProductSkillsStatus("global", undefined, {
        sourceRoot: this.sourceRoot,
      });
      if (
        !status.updateAvailable ||
        !(await this.sourceInfo()).sourceAvailable
      ) {
        return;
      }
      const result = await installProductSkills("global", undefined, {
        sourceRoot: this.sourceRoot,
        packVersion: status.packVersion,
      });
      logDaemonDiagnostic("info", "skills.autoUpdate", {
        action: result.action,
        fromVersion: status.installedVersion,
        packVersion: result.packVersion,
      });
    } catch {
      logDaemonDiagnostic("warn", "skills.autoUpdateFailed");
    }
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
