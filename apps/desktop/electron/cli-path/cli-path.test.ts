import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPathHint,
  getCliInstallBinDir,
  getCliInstallPath,
  getCliLauncherFileName,
  installCliOnPath,
  isBinDirOnPath,
  readCliPathStatus,
  resolveBundledCliLauncherPath,
  uninstallCliFromPath,
} from "./cli-path";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-cli-path-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFileWithDirs(
  filePath: string,
  content: string,
  options?: { mode?: number },
) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, options);
}

describe("cli-path helpers", () => {
  it("picks platform-specific launcher names", () => {
    expect(getCliLauncherFileName("darwin")).toBe("cocurdex");
    expect(getCliLauncherFileName("linux")).toBe("cocurdex");
    expect(getCliLauncherFileName("win32")).toBe("cocurdex.cmd");
  });

  it("resolves user-local install directories", () => {
    expect(getCliInstallBinDir("darwin", "/Users/me")).toBe(
      "/Users/me/.local/bin",
    );
    expect(
      getCliInstallBinDir("win32", "C:\\Users\\me", {
        LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
      }),
    ).toBe(path.join("C:\\Users\\me\\AppData\\Local", "Cocurdex", "bin"));
  });

  it("detects bin dir on PATH", () => {
    expect(
      isBinDirOnPath(
        "/Users/me/.local/bin",
        "/usr/bin:/Users/me/.local/bin",
        "darwin",
      ),
    ).toBe(true);
    expect(
      isBinDirOnPath("/Users/me/.local/bin", "/usr/bin:/bin", "darwin"),
    ).toBe(false);
    expect(
      isBinDirOnPath(
        "C:\\Users\\me\\AppData\\Local\\Cocurdex\\bin",
        "C:\\Windows;C:\\Users\\me\\AppData\\Local\\Cocurdex\\bin",
        "win32",
      ),
    ).toBe(true);
  });

  it("resolves packaged vs dev launcher paths", () => {
    expect(
      resolveBundledCliLauncherPath({
        platform: "darwin",
        isPackaged: true,
        resourcesPath: "/Apps/Cocurdex.app/Contents/Resources",
        desktopRoot: "/repo/apps/desktop",
      }),
    ).toBe("/Apps/Cocurdex.app/Contents/Resources/cli/cocurdex");

    expect(
      resolveBundledCliLauncherPath({
        platform: "darwin",
        isPackaged: false,
        resourcesPath: "/ignored",
        desktopRoot: "/repo/apps/desktop",
      }),
    ).toBe("/repo/apps/desktop/resources/cli/cocurdex");
  });

  it("installs and uninstalls a posix symlink", async () => {
    const home = await makeTempDir();
    const sourceDir = path.join(home, "app", "cli");
    const sourcePath = path.join(sourceDir, "cocurdex");
    await writeFileWithDirs(sourcePath, "#!/bin/sh\necho ok\n", {
      mode: 0o755,
    });

    const installed = await installCliOnPath({
      platform: "darwin",
      sourcePath,
      home,
      env: {},
    });

    expect(installed.installed).toBe(true);
    expect(installed.pointsToCurrentApp).toBe(true);
    expect(installed.installPath).toBe(
      path.join(home, ".local", "bin", "cocurdex"),
    );
    expect(installed.sourcePath).toBe(sourcePath);

    const removed = await uninstallCliFromPath({
      platform: "darwin",
      sourcePath,
      home,
      env: {},
    });
    expect(removed.installed).toBe(false);
    expect(removed.pointsToCurrentApp).toBe(false);
  });

  it("installs a windows shim without touching the registry in tests", async () => {
    const home = await makeTempDir();
    const sourcePath = path.join(
      home,
      "Cocurdex",
      "resources",
      "cli",
      "cocurdex.cmd",
    );
    await writeFileWithDirs(sourcePath, "@echo off\r\n");
    let ensured: string | null = null;

    const status = await installCliOnPath({
      platform: "win32",
      sourcePath,
      home,
      env: { LOCALAPPDATA: path.join(home, "AppData", "Local") },
      ensureWindowsUserPath: async (binDir) => {
        ensured = binDir;
      },
    });

    expect(status.installed).toBe(true);
    expect(status.pointsToCurrentApp).toBe(true);
    expect(ensured).toBe(
      path.join(home, "AppData", "Local", "Cocurdex", "bin"),
    );
    const shim = await readFile(status.installPath, "utf8");
    expect(shim).toContain(sourcePath);
  });

  it("reports status when nothing is installed", async () => {
    const home = await makeTempDir();
    const sourcePath = path.join(home, "missing", "cocurdex");
    const status = await readCliPathStatus({
      platform: "linux",
      sourcePath,
      home,
      env: {},
      pathEnv: "/usr/bin",
    });
    expect(status.available).toBe(false);
    expect(status.installed).toBe(false);
    expect(status.binDirOnPath).toBe(false);
    expect(status.pathHint).toContain("export PATH=");
    expect(buildPathHint(status.binDir, "linux")).toContain(status.binDir);
  });

  it("does not claim ownership of an unrelated symlink", async () => {
    const home = await makeTempDir();
    const binDir = path.join(home, ".local", "bin");
    const installPath = getCliInstallPath("darwin", home, {});
    const foreign = path.join(home, "other-cocurdex");
    await writeFileWithDirs(foreign, "foreign");
    await mkdir(binDir, { recursive: true });
    await symlink(foreign, installPath);

    const ourSource = path.join(home, "app", "cocurdex");
    await writeFileWithDirs(ourSource, "ours");

    const status = await readCliPathStatus({
      platform: "darwin",
      sourcePath: ourSource,
      home,
      env: {},
    });
    expect(status.installed).toBe(true);
    expect(status.pointsToCurrentApp).toBe(false);

    const afterUninstall = await uninstallCliFromPath({
      platform: "darwin",
      sourcePath: ourSource,
      home,
      env: {},
    });
    // Foreign install left alone.
    expect(afterUninstall.installed).toBe(true);
  });
});
