import { existsSync, mkdtempSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DATABASE_FILENAME } from "@cocurdex/daemon/paths";
import {
  buildFixtureDb,
  FIXTURE_DATA_DIRECTORIES,
  FIXTURE_MANIFEST_FILENAME,
  type FixtureManifest,
} from "./build";
import { materializeFixtureWorkspace } from "./workspace";

export interface InstalledFixtureWorkspace {
  id: string;
  name: string;
  rootPaths: string[];
}

export interface InstalledFixture extends FixtureManifest {
  workspacePath: string;
  installedWorkspaces: InstalledFixtureWorkspace[];
}

export async function installFixtureDb(input: {
  userDataPath: string;
  workspaceParent: string;
  builtDir?: string;
}): Promise<InstalledFixture> {
  const built = input.builtDir ?? mkdtempSync(path.join(tmpdir(), "cfx-out-"));
  try {
    if (!input.builtDir) await buildFixtureDb(built);
    const manifest = JSON.parse(
      await readFile(path.join(built, FIXTURE_MANIFEST_FILENAME), "utf8"),
    ) as FixtureManifest;
    await mkdir(input.userDataPath, { recursive: true });
    await copyFile(
      path.join(built, DATABASE_FILENAME),
      path.join(input.userDataPath, DATABASE_FILENAME),
    );
    for (const directory of FIXTURE_DATA_DIRECTORIES) {
      const source = path.join(built, directory);
      if (!existsSync(source)) continue;
      await cp(source, path.join(input.userDataPath, directory), {
        recursive: true,
      });
    }
    const installedWorkspaces: InstalledFixtureWorkspace[] = [];
    for (const workspace of manifest.workspaces) {
      installedWorkspaces.push({
        id: workspace.id,
        name: workspace.name,
        rootPaths: await materializeFixtureWorkspace(
          workspace,
          input.workspaceParent,
        ),
      });
    }
    const primary = installedWorkspaces.find(
      (workspace) => workspace.id === manifest.workspaceId,
    );
    if (!primary)
      throw new Error("Fixture manifest lacks its primary workspace");
    return {
      ...manifest,
      workspacePath: primary.rootPaths[0],
      installedWorkspaces,
    };
  } finally {
    if (!input.builtDir) {
      await rm(built, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }
}
