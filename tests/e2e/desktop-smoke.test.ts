import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDaemonMetadataPath } from "@cocurdex/daemon/paths";
import type { DaemonMetadata } from "@cocurdex/rpc";
import {
  type ElectronApplication,
  _electron as electron,
} from "@playwright/test";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot, sleep, waitFor } from "./helpers/daemon-process";

const desktopRoot = path.join(repoRoot, "apps", "desktop");
const mainEntry = path.join(desktopRoot, "out", "main", "main.js");
const rendererEntry = path.join(desktopRoot, "out", "renderer", "index.html");
const daemonBundle = path.join(desktopRoot, "resources", "cli", "daemon.cjs");
const electronPackageDir = path.join(desktopRoot, "node_modules", "electron");

function resolveElectronExecutable() {
  const relative = readFileSync(
    path.join(electronPackageDir, "path.txt"),
    "utf8",
  ).trim();
  return path.join(electronPackageDir, "dist", relative);
}

const buildReady =
  existsSync(mainEntry) &&
  existsSync(rendererEntry) &&
  existsSync(daemonBundle) &&
  existsSync(path.join(electronPackageDir, "path.txt"));

describe.skipIf(!buildReady)("desktop app boot (built output)", () => {
  let userDataPath = "";
  let app: ElectronApplication | undefined;

  afterAll(async () => {
    await app?.close();
    if (userDataPath) {
      await rm(userDataPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  });

  it("boots a window and spawns a live daemon", async () => {
    userDataPath = mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-desktop-"));
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    env.COCURDEX_USER_DATA_PATH = userDataPath;
    env.NO_COLOR = "1";
    env.TZ = "UTC";
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: resolveElectronExecutable(),
      args: [desktopRoot, "--no-sandbox"],
      env,
    });

    const page = await app.firstWindow();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const metadataPath = getDaemonMetadataPath(userDataPath);
    await waitFor(() => existsSync(metadataPath), 30_000);
    const metadata = JSON.parse(
      readFileSync(metadataPath, "utf8"),
    ) as DaemonMetadata;
    expect(metadata.pid).toBeGreaterThan(0);
    expect(metadata.token).toBeTruthy();

    const status = await requestDaemon("daemon.status", { metadata });
    expect(status.pid).toBe(metadata.pid);
    expect(status.startedAt).toBe(metadata.startedAt);

    await sleep(2_000);
    expect(pageErrors).toEqual([]);
  });
});
