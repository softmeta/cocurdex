import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnCommand } from "@cocurdex/agent-adapters";
import { readDaemonMetadata, requestDaemon } from "@cocurdex/daemon/client";
import { PRODUCT_SKILL_NAMES } from "@cocurdex/product-skills";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  repoRoot,
  requestDaemonShutdown,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const target = `${process.platform}-${process.arch}`;
const archiveRoot = path.join(
  repoRoot,
  "apps/desktop/release/headless",
  `cocurdex-headless-${target}`,
);
const launcher = path.join(
  archiveRoot,
  "bin",
  process.platform === "win32" ? "cocurdex.cmd" : "cocurdex",
);
const tempDirs = createTempDirs();
const userDataPath = tempDirs.createSync("cocu-hl-");
const options = { userDataPath };

function cli(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawnCommand(launcher, args, {
      cwd: archiveRoot,
      env: {
        PATH: process.platform === "win32" ? process.env.PATH : "/usr/bin:/bin",
        SystemRoot: process.env.SystemRoot,
        HOME: userDataPath,
        USERPROFILE: userDataPath,
        COCURDEX_USER_DATA_PATH: userDataPath,
        COCURDEX_DISABLE_MEMORY_AUTO_START: "1",
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
        : reject(
            new Error(`cocurdex ${args.join(" ")} exited ${code}: ${stderr}`),
          ),
    );
  });
}

beforeAll(() => {
  if (!existsSync(launcher)) {
    throw new Error(
      `Missing ${archiveRoot}; run \`pnpm exec turbo run build:headless --filter @cocurdex/desktop\` first`,
    );
  }
});

afterAll(async () => {
  const metadata = await readDaemonMetadata(userDataPath).catch(() => null);
  if (metadata) {
    await requestDaemonShutdown(metadata);
    await waitFor(() => !isAlive(metadata.pid), 15_000).catch(() => undefined);
  }
  await tempDirs.cleanup();
});

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("headless archive", () => {
  it("starts its own daemon on the bundled Node runtime without a display", async () => {
    const status = JSON.parse(await cli(["daemon", "status", "--json"]));
    const [, bundledNode] = /node (\S+)/.exec(
      await readFile(path.join(archiveRoot, "VERSION"), "utf8"),
    ) ?? ["", ""];
    const health = await requestDaemon("daemon.health", options);

    expect(status.pid).toBe(health.pid);
    expect(health.nodeVersion).toBe(bundledNode);
    expect(["keyring", "file"]).toContain(health.credentialStore);
    const background = await requestDaemon("daemon.background.get", options);
    expect(background.available).toBe(true);
  });

  it("loads its native modules and bundled tools", async () => {
    const root = tempDirs.createSync("cocu-hl-ws-");
    await writeFile(path.join(root, "readme.md"), "headless\n");
    const now = "2026-11-11T00:00:00.000Z";
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "headless-workspace",
          name: "acme-headless",
          rootPaths: [root],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      options,
    );

    const files = await requestDaemon(
      "workspace.listFiles",
      { rootPath: root },
      options,
    );
    expect(files.map((file) => file.relativePath)).toContain("readme.md");

    const terminal = await requestDaemon(
      "terminal.spawn",
      {
        terminalId: "headless-terminal",
        workspaceId: "headless-workspace",
        cwd: root,
        cols: 80,
        rows: 24,
      },
      options,
    );
    expect(terminal.pid).toBeGreaterThan(0);
    await requestDaemon(
      "terminal.kill",
      { terminalId: "headless-terminal" },
      options,
    );

    const skills = await requestDaemon(
      "skills.pack.getStatus",
      { scope: "global", workspaceRootPath: null },
      options,
    );
    expect(skills.sourceAvailable).toBe(true);
    expect(skills.packSkills.map((skill) => skill.name)).toEqual([
      ...PRODUCT_SKILL_NAMES,
    ]);
  });

  it("serves the web client to this computer", async () => {
    const metadata = await readDaemonMetadata(userDataPath);
    const origin = metadata.webSocketUrl.replace(/^ws/, "http");
    const response = await fetch(`${origin}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<html");
  });
});
