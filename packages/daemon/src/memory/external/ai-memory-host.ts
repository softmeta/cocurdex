import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";
import {
  AI_MEMORY_RELEASE_BASE_URL,
  AI_MEMORY_VERSION,
  type AiMemoryAsset,
} from "@cocurdex/shared";
import { extractArchive } from "../../archive-extract";
import { downloadVerified } from "../../verified-download";

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 250;
const INIT_TIMEOUT_MS = 60_000;

export function managedAiMemoryDir(userDataPath: string) {
  return path.join(userDataPath, "ai-memory");
}

export function managedAiMemoryDataDir(userDataPath: string) {
  return path.join(managedAiMemoryDir(userDataPath), "data");
}

async function isFile(file: string) {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  );
}

export async function installManagedAiMemory(input: {
  userDataPath: string;
  asset: AiMemoryAsset;
  platform: NodeJS.Platform;
  baseUrl?: string;
}) {
  const directory = path.join(
    managedAiMemoryDir(input.userDataPath),
    "bin",
    AI_MEMORY_VERSION,
  );
  const executable = path.join(directory, input.asset.executable);
  if (await isFile(executable)) return executable;
  const staging = `${directory}.staging-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  try {
    const archive = path.join(staging, `.download-${randomUUID()}`);
    await downloadVerified(
      `${input.baseUrl ?? AI_MEMORY_RELEASE_BASE_URL}/${input.asset.file}`,
      archive,
      { sha256: input.asset.sha256, size: input.asset.size },
    );
    const format = input.asset.file.endsWith(".zip") ? "zip" : "tar";
    await extractArchive(format, archive, staging);
    await rm(archive, { force: true });
    const staged = path.join(staging, input.asset.executable);
    if (!(await isFile(staged))) {
      throw new Error(
        `The ai-memory ${AI_MEMORY_VERSION} archive has no binary`,
      );
    }
    if (input.platform !== "win32") await chmod(staged, 0o755);
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
    return executable;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  return new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child.pid) void killProcessTree(child.pid).catch(() => undefined);
      reject(new Error("ai-memory init timed out"));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

/** `ai-memory init` writes config.toml and the root bearer token. */
export async function initAiMemoryDataDir(executable: string, dataDir: string) {
  const ready = await access(path.join(dataDir, "config.toml")).then(
    () => true,
    () => false,
  );
  if (ready) return;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const child = spawnCommand(executable, ["init", "--data-dir", dataDir], {
    stdio: "ignore",
  });
  const code = await waitForExit(child, INIT_TIMEOUT_MS);
  if (code !== 0) throw new Error(`ai-memory init exited with ${code}`);
}

export async function aiMemoryAnswers(url: string, timeoutMs = 1_500) {
  try {
    const response = await fetch(`${url}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface HostedAiMemory {
  url: string;
  dataDir: string;
  running(): boolean;
  stop(): Promise<void>;
}

export async function hostAiMemory(input: {
  executable: string;
  dataDir: string;
  port: number;
  exited(code: number | null): void;
}): Promise<HostedAiMemory> {
  const url = `http://127.0.0.1:${input.port}`;
  const child = spawnCommand(
    input.executable,
    [
      "serve",
      "--data-dir",
      input.dataDir,
      "--transport",
      "http",
      "--bind",
      `127.0.0.1:${input.port}`,
      "--enable-api",
    ],
    { stdio: "ignore" },
  );
  let exitCode: number | null | undefined;
  let stopping = false;
  const exited = new Promise<void>((resolve) => {
    const finish = (code: number | null) => {
      if (exitCode !== undefined) return;
      exitCode = code;
      resolve();
      if (!stopping) input.exited(code);
    };
    child.once("exit", finish);
    child.once("error", () => finish(null));
  });
  const stop = async () => {
    if (exitCode !== undefined) return;
    stopping = true;
    if (child.pid) await killProcessTree(child.pid).catch(() => undefined);
    await exited;
  };
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (!(await aiMemoryAnswers(url, HEALTH_POLL_MS * 4))) {
    if (exitCode !== undefined) {
      throw new Error(`ai-memory serve exited with ${exitCode}`);
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`ai-memory did not answer at ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS));
  }
  return {
    url,
    dataDir: input.dataDir,
    running: () => exitCode === undefined,
    stop,
  };
}
