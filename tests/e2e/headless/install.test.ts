import { createReadStream, existsSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { spawnCommand } from "@cocurdex/agent-adapters";
import { readDaemonMetadata } from "@cocurdex/daemon/client";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  repoRoot,
  requestDaemonShutdown,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const isWindows = process.platform === "win32";
const target = `${process.platform}-${process.arch}`;
const releaseDir = path.join(repoRoot, "apps/desktop/release/headless");
const asset = `cocurdex-headless-${target}${isWindows ? ".zip" : ".tar.gz"}`;
const scriptsDir = path.join(repoRoot, "apps/desktop/scripts");
const tempDirs = createTempDirs();
const root = tempDirs.createSync("cocu-hi-");
const userDataPath = path.join(root, "data");
const installDir = path.join(root, "install");
const binDir = path.join(root, "bin");
const launcher = path.join(
  installDir,
  "bin",
  isWindows ? "cocurdex.cmd" : "cocurdex",
);
let server: Server;
let downloadUrl: string;

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        LOCALAPPDATA: root,
        TEMP: root,
        TMP: root,
        TMPDIR: root,
        HOME: root,
        USERPROFILE: root,
        COCURDEX_USER_DATA_PATH: userDataPath,
        COCURDEX_DISABLE_MEMORY_AUTO_START: "1",
        COCURDEX_DOWNLOAD_URL: downloadUrl,
        COCURDEX_INSTALL_DIR: installDir,
        COCURDEX_BIN_DIR: binDir,
        COCURDEX_NO_MODIFY_PATH: "1",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${command} exited ${code}: ${stdout}${stderr}`)),
    );
  });
}

function install() {
  if (isWindows) {
    return run("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(scriptsDir, "headless-install.ps1"),
    ]);
  }
  return run("sh", [path.join(scriptsDir, "headless-install.sh")]);
}

async function daemonLogTail() {
  const file = path.join(userDataPath, "logs", "daemon", "daemon.log");
  const text = await readFile(file, "utf8").catch(() => "");
  return text.split(/\r?\n/).slice(-40).join("\n");
}

async function windowsStopProbe() {
  if (!isWindows) return "";
  const script = [
    `$l = '${launcher}'`,
    "'Test-Path: ' + (Test-Path $l)",
    "'Test-Path -LiteralPath: ' + (Test-Path -LiteralPath $l)",
    "$ErrorActionPreference = 'Continue'",
    "'stop: ' + ((& $l daemon stop --json 2>&1 | Out-String).Trim())",
    "'exit: ' + $LASTEXITCODE",
  ].join("; ");
  return run("powershell.exe", ["-NoProfile", "-Command", script]).catch(
    (error: Error) => error.message,
  );
}

async function withDaemonLog<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      `${(error as Error).message}\n--- daemon.log ---\n${await daemonLogTail()}`,
    );
  }
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!existsSync(path.join(releaseDir, asset))) {
    throw new Error(
      `Missing ${asset}; run \`pnpm exec turbo run build:headless --filter @cocurdex/desktop\` first`,
    );
  }
  server = createServer((request, response) => {
    const file = path.join(releaseDir, path.basename(request.url ?? ""));
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200);
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  downloadUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  const metadata = await readDaemonMetadata(userDataPath).catch(() => null);
  if (metadata) {
    await requestDaemonShutdown(metadata);
    await waitFor(() => !isAlive(metadata.pid), 15_000).catch(() => undefined);
  }
  await new Promise((resolve) => server?.close(resolve));
  await tempDirs.cleanup();
});

describe("headless install script", () => {
  it("installs a verified archive and puts the CLI on the bin path", async () => {
    await install();

    const status = JSON.parse(
      await run(launcher, ["daemon", "status", "--json"]),
    );
    expect(isAlive(status.pid)).toBe(true);
    if (!isWindows) {
      const link = await lstat(path.join(binDir, "cocurdex"));
      expect(link.isSymbolicLink()).toBe(true);
    }
  });

  it("stops the running daemon to upgrade in place and starts it again", async () => {
    const before = await readDaemonMetadata(userDataPath);
    if (!isAlive(before.pid)) {
      throw new Error(
        `daemon ${before.pid} exited before the upgrade\n${await daemonLogTail()}`,
      );
    }

    const output = await withDaemonLog(async () => {
      const result = await install();
      if (!result.includes("Restarted the daemon")) {
        throw new Error(
          `Install did not restart the daemon (old daemon ${before.pid} alive: ${isAlive(before.pid)}):\n${result}\n--- stop probe ---\n${await windowsStopProbe()}`,
        );
      }
      return result;
    });

    expect(output).toContain("Stopped the daemon to upgrade it");
    const after = await readDaemonMetadata(userDataPath);
    expect(after.pid).not.toBe(before.pid);
    expect(isAlive(before.pid)).toBe(false);
    expect(isAlive(after.pid)).toBe(true);
  });
});
