import { type ChildProcess, execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { acquireDaemonOwnership } from "@cocurdex/daemon/internal/daemon-ownership";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

const execFileAsync = promisify(execFile);
const FIXTURE_START_TIMEOUT_MS = 45_000;
const moduleUrl = pathToFileURL(
  createRequire(import.meta.url).resolve(
    "@cocurdex/daemon/internal/daemon-ownership",
  ),
).href;
const importOwnership = `import { acquireDaemonOwnership } from ${JSON.stringify(moduleUrl)};`;

async function directory() {
  const result = await tempDirs.create("cd-owner-");
  return result;
}

function waitForFixture(child: ChildProcess, name: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${name} did not start`)),
      FIXTURE_START_TIMEOUT_MS,
    );
    child.once("message", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`${name} exited`));
    });
  });
}

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("daemon ownership", () => {
  it("excludes other processes even after a same-process contender fails", async () => {
    const userDataPath = await directory();
    const owner = await acquireDaemonOwnership(userDataPath);
    try {
      await expect(acquireDaemonOwnership(userDataPath)).rejects.toThrow(
        "Cannot acquire daemon ownership",
      );
      const result = await execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        ${importOwnership}
        try {
          const owner = await acquireDaemonOwnership(process.argv[1]);
          owner.release();
          console.log("acquired");
        } catch {
          console.log("blocked");
        }
      `,
          userDataPath,
        ],
        { timeout: 10_000 },
      );
      expect(result.stdout.trim()).toBe("blocked");
    } finally {
      owner.release();
    }
    const successor = await acquireDaemonOwnership(userDataPath);
    owner.release();
    await expect(acquireDaemonOwnership(userDataPath)).rejects.toThrow();
    successor.release();
  }, 30_000);

  it("releases ownership after the holding process is killed", async () => {
    const userDataPath = await directory();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      ${importOwnership}
      const owner = await acquireDaemonOwnership(process.argv[1]);
      process.send("ready");
      setInterval(() => {}, 1000);
    `,
        userDataPath,
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
    );
    const exited = once(child, "exit");
    try {
      await waitForFixture(child, "Ownership fixture");
      await expect(acquireDaemonOwnership(userDataPath)).rejects.toThrow();
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
    const successor = await acquireDaemonOwnership(userDataPath);
    successor.release();
  }, 60_000);

  it("fails fast while the incumbent is still serving", async () => {
    const userDataPath = await directory();
    const owner = await acquireDaemonOwnership(userDataPath);
    try {
      const startedAt = performance.now();
      await expect(
        acquireDaemonOwnership(userDataPath, {
          isIncumbentServing: async () => true,
        }),
      ).rejects.toThrow("Cannot acquire daemon ownership");
      expect(performance.now() - startedAt).toBeLessThan(1000);
    } finally {
      owner.release();
    }
  });

  it("takes over once an incumbent that stopped serving finishes teardown", async () => {
    const userDataPath = await directory();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      ${importOwnership}
      const owner = await acquireDaemonOwnership(process.argv[1]);
      process.send("ready", () => {
        setTimeout(() => {
          owner.release();
          process.exit(0);
        }, 300);
      });
    `,
        userDataPath,
      ],
      { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true },
    );
    const exited = once(child, "exit");
    try {
      await waitForFixture(child, "Teardown fixture");
      const successor = await acquireDaemonOwnership(userDataPath, {
        isIncumbentServing: async () => false,
      });
      successor.release();
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  }, 60_000);

  it("allows independent data directories", async () => {
    const first = await acquireDaemonOwnership(await directory());
    try {
      const second = await acquireDaemonOwnership(await directory());
      second.release();
    } finally {
      first.release();
    }
  });
});
