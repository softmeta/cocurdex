import { execFile } from "node:child_process";
import { copyFile, mkdtemp, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { openAppSession } from "./app-session.mjs";
import { daemonRequest } from "./daemon-rpc.mjs";
import { launchIsolatedInstance, removeTempDir } from "./instance.mjs";

const HARNESS_DIR = fileURLToPath(new URL("../../harness/", import.meta.url));
const FIXTURE_DB_TIMEOUT_MS = 120_000;

const SCENARIO_WORKSPACE_ID = "scenario-workspace";

async function seedWorkspaces(session, workspaces) {
  for (const [index, workspace] of workspaces.entries()) {
    const now = new Date(Date.now() + index).toISOString();
    await daemonRequest(session, "workspace.save", {
      workspace: {
        ...workspace,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        sortOrder: (workspaces.length - 1 - index) * 1000,
      },
    });
  }
  await session.reload();
}

function fixtureDbWorkspaces(install) {
  const isPrimary = (workspace) => workspace.id === install.workspaceId;
  return [...install.installedWorkspaces].sort(
    (left, right) => Number(isPrimary(left)) - Number(isPrimary(right)),
  );
}

async function installFixtureDb(userDataPath, workspaceParent) {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "fixture-db/cli.ts",
      "--user-data",
      userDataPath,
      "--workspace-parent",
      workspaceParent,
    ],
    { cwd: HARNESS_DIR, timeout: FIXTURE_DB_TIMEOUT_MS },
  );
  return JSON.parse(stdout.trim().split(/\r?\n/).pop());
}

const SHARED_INSTANCE_ENV = "COCURDEX_SCENARIO_INSTANCE";

function scenarioWorkspaces(workspaceRoot, fixtureDbInstall) {
  if (fixtureDbInstall) return fixtureDbWorkspaces(fixtureDbInstall);
  return [
    {
      id: SCENARIO_WORKSPACE_ID,
      name: path.basename(workspaceRoot),
      rootPaths: [workspaceRoot],
    },
  ];
}

async function copyFixtures(fixtures, workspaceRoot) {
  const files = {};
  for (const fixture of fixtures) {
    const target = path.join(workspaceRoot, path.basename(fixture));
    await copyFile(fixture, target);
    files[fixture] = target;
  }
  return files;
}

function readSharedInstance() {
  const value = process.env[SHARED_INSTANCE_ENV];
  return value ? JSON.parse(value) : null;
}

export async function launchSharedScenarioInstance() {
  const workspaceRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cocu-ws-")),
  );
  let fixtureDb = null;
  let instance;
  try {
    instance = await launchIsolatedInstance({
      prepareUserData: async (userDataPath) => {
        fixtureDb = await installFixtureDb(userDataPath, workspaceRoot);
      },
    });
  } catch (error) {
    await removeTempDir(workspaceRoot);
    throw error;
  }
  const { port, url } = instance;
  return {
    port,
    pid: instance.pid,
    env: {
      [SHARED_INSTANCE_ENV]: JSON.stringify({
        port,
        url,
        workspaceRoot,
        fixtureDb,
      }),
    },
    async stop({ passed = false } = {}) {
      try {
        await instance.stop({ keepLog: !passed });
        if (!passed) console.error(`Shared instance log: ${instance.logPath}`);
      } finally {
        await removeTempDir(workspaceRoot);
      }
    },
  };
}

async function attachSharedInstance(shared, { fixtures, fixtureDb }) {
  if (fixtureDb && !shared.fixtureDb) {
    throw new Error("Shared instance has no fixture database");
  }
  const fixtureDbInstall = fixtureDb ? shared.fixtureDb : null;
  const workspaceRoot = await realpath(
    await mkdtemp(path.join(shared.workspaceRoot, "scenario-")),
  );
  const removeWorkspace = () => removeTempDir(workspaceRoot);
  let session;
  try {
    const files = await copyFixtures(fixtures, workspaceRoot);
    session = await openAppSession(shared);
    await seedWorkspaces(
      session,
      scenarioWorkspaces(workspaceRoot, fixtureDbInstall),
    );
    return {
      session,
      isolated: false,
      workspaceRoot,
      files,
      fixtureDb: fixtureDbInstall,
      close: async () => {
        session.close();
        await removeWorkspace();
      },
    };
  } catch (error) {
    session?.close();
    await removeWorkspace();
    throw error;
  }
}

export async function openScenarioApp(
  { port, url, keep, "fixture-db": fixtureDbArg },
  { fixtures = [], fixtureDb = fixtureDbArg, isolated = false } = {},
) {
  if (port) {
    const session = await openAppSession({ port, url });
    return {
      session,
      isolated: false,
      files: {},
      close: () => session.close(),
    };
  }
  const shared = isolated ? null : readSharedInstance();
  if (shared) return attachSharedInstance(shared, { fixtures, fixtureDb });
  const workspaceRoot = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "cocu-ws-")),
  );
  let fixtureDbInstall = null;
  let instance;
  try {
    instance = await launchIsolatedInstance({
      prepareUserData: fixtureDb
        ? async (userDataPath) => {
            fixtureDbInstall = await installFixtureDb(
              userDataPath,
              workspaceRoot,
            );
          }
        : undefined,
    });
  } catch (error) {
    await removeTempDir(workspaceRoot);
    throw error;
  }
  let session;
  const close = async ({ passed = false } = {}) => {
    session?.close();
    if (keep) {
      const { pid, port, url, userDataPath, logPath } = instance;
      console.error(
        JSON.stringify({
          pid,
          port,
          url,
          userDataPath,
          logPath,
          workspaceRoot,
        }),
      );
      return;
    }
    try {
      await instance.stop({ keepLog: !passed });
      if (!passed) console.error(`Isolated instance log: ${instance.logPath}`);
    } finally {
      await removeTempDir(workspaceRoot);
    }
  };
  try {
    const files = await copyFixtures(fixtures, workspaceRoot);
    session = await openAppSession(instance);
    await seedWorkspaces(
      session,
      scenarioWorkspaces(workspaceRoot, fixtureDbInstall),
    );
    return {
      session,
      isolated: true,
      instance,
      workspaceRoot,
      files,
      fixtureDb: fixtureDbInstall,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
