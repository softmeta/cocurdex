import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { acquireDaemonOwnership } from "./daemon-ownership";

const execFileAsync = promisify(execFile);
const directories: string[] = [];
const moduleUrl = new URL("./daemon-ownership.ts", import.meta.url).href;
const importOwnership = `import { acquireDaemonOwnership } from ${JSON.stringify(moduleUrl)};`;

async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), "cd-owner-"));
  directories.push(result);
  return result;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((entry) => rm(entry, { recursive: true, force: true })),
  );
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
  });

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
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Ownership fixture did not start")),
          10_000,
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
          reject(new Error("Ownership fixture exited"));
        });
      });
      await expect(acquireDaemonOwnership(userDataPath)).rejects.toThrow();
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
    const successor = await acquireDaemonOwnership(userDataPath);
    successor.release();
  });

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
