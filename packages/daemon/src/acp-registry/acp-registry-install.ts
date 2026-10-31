import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { buildChildProcessEnv, spawnCommand } from "@cocurdex/agent-adapters";
import {
  type AcpRegistryInstalledAgent,
  type AcpRegistryInstallPlan,
  type AcpRegistryLaunchCommand,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import {
  type AcpRegistryBinaryTarget,
  type AcpRegistryEntry,
  proxiedFetch,
} from "./acp-registry-catalog";

const execFileAsync = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const PREFETCH_ERROR_TAIL_LENGTH = 600;

export type RunPrefetch = (command: AcpRegistryLaunchCommand) => Promise<void>;

export async function runPrefetch({
  command,
  args,
  env,
}: AcpRegistryLaunchCommand) {
  let stderr = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawnCommand(command, args, {
        env: buildChildProcessEnv(process.env, { extraEnv: env }),
        stdio: ["ignore", "ignore", "pipe"],
        timeout: DOWNLOAD_TIMEOUT_MS,
      });
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-PREFETCH_ERROR_TAIL_LENGTH);
      });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`exited with ${signal ?? `code ${code}`}`));
      });
    });
  } catch (error) {
    const detail = stderr.trim() || (error as Error).message;
    throw new Error(`${command} could not download the package: ${detail}`);
  }
}

export function getAcpRegistryAgentsRoot(userDataPath: string) {
  return path.join(userDataPath, "acp-agents");
}

type ArchiveFormat = "zip" | "tar" | "raw";

export function getArchiveFormat(archiveUrl: string): ArchiveFormat {
  const name = new URL(archiveUrl).pathname.toLowerCase();
  if (name.endsWith(".zip")) {
    return "zip";
  }
  if (/\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$/.test(name)) {
    return "tar";
  }
  return "raw";
}

export function resolveInstalledCommand(directory: string, cmd: string) {
  const resolved = path.resolve(directory, cmd);
  const relative = path.relative(directory, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`ACP Registry command escapes its install directory`);
  }
  return resolved;
}

async function downloadVerified(
  url: string,
  destination: string,
  sha256: string | null,
) {
  const response = await proxiedFetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with ${response.status}: ${url}`);
  }
  const hash = createHash("sha256");
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    createWriteStream(destination),
  );
  const digest = hash.digest("hex");
  if (sha256 && digest !== sha256) {
    throw new Error(`Checksum mismatch for ${url}`);
  }
}

type ExtractCommand = { command: string; args: string[] };

export function listExtractCommands(
  format: ArchiveFormat,
  file: string,
  directory: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): ExtractCommand[] {
  const tarArgs = ["-xf", file, "-C", directory];
  if (platform === "win32") {
    const systemRoot = env.SystemRoot || env.windir || "C:\\Windows";
    return [
      {
        command: path.win32.join(systemRoot, "System32", "tar.exe"),
        args: tarArgs,
      },
    ];
  }
  if (format === "zip" && platform === "linux") {
    return [
      { command: "unzip", args: ["-q", "-o", file, "-d", directory] },
      { command: "bsdtar", args: tarArgs },
      { command: "python3", args: ["-m", "zipfile", "-e", file, directory] },
    ];
  }
  return [{ command: "tar", args: tarArgs }];
}

async function extract(format: ArchiveFormat, file: string, directory: string) {
  const candidates = listExtractCommands(format, file, directory);
  for (const [index, candidate] of candidates.entries()) {
    try {
      await execFileAsync(candidate.command, candidate.args, {
        windowsHide: true,
      });
      return;
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!missing || index === candidates.length - 1) {
        throw missing
          ? new Error(
              `Cannot extract ${path.basename(file)}: install unzip and retry`,
            )
          : error;
      }
    }
  }
}

async function installBinary(
  target: AcpRegistryBinaryTarget,
  directory: string,
) {
  const staging = `${directory}.staging-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  try {
    const format = getArchiveFormat(target.archive);
    const command = resolveInstalledCommand(staging, target.cmd);
    if (format === "raw") {
      await mkdir(path.dirname(command), { recursive: true });
      await downloadVerified(target.archive, command, target.sha256);
    } else {
      const archive = path.join(staging, `.download-${randomUUID()}`);
      await downloadVerified(target.archive, archive, target.sha256);
      await extract(format, archive, staging);
      await rm(archive, { force: true });
    }
    if (!(await stat(command)).isFile()) {
      throw new Error(`ACP Registry command ${target.cmd} was not installed`);
    }
    if (process.platform !== "win32") {
      await chmod(command, 0o755);
    }
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function packageLaunch(kind: "npx" | "uvx", pkg: string, args: string[]) {
  return kind === "npx"
    ? { command: "npx", args: ["-y", pkg, ...args] }
    : { command: "uvx", args: [pkg, ...args] };
}

function packagePrefetch(kind: "npx" | "uvx", pkg: string) {
  return kind === "npx"
    ? { command: "npx", args: ["-y", "-p", pkg, "-c", "exit 0"] }
    : { command: "uvx", args: ["--from", pkg, "python", "-c", ""] };
}

export function planAcpRegistryInstall(
  entry: AcpRegistryEntry,
  userDataPath: string,
): AcpRegistryInstallPlan | null {
  const { agent, launch } = entry;
  if (!launch) {
    return null;
  }
  if (launch.kind !== "binary") {
    const { package: pkg, args, env } = launch.target;
    return {
      launch: { ...packageLaunch(launch.kind, pkg, args), env },
      download: null,
      prefetch: { ...packagePrefetch(launch.kind, pkg), env },
    };
  }
  const { archive, cmd, args, env, sha256 } = launch.target;
  const directory = path.join(
    getAcpRegistryAgentsRoot(userDataPath),
    agent.registryId,
    agent.version,
  );
  return {
    launch: { command: resolveInstalledCommand(directory, cmd), args, env },
    download: { url: archive, sha256, directory },
    prefetch: null,
  };
}

export async function installAcpRegistryAgent(
  entry: AcpRegistryEntry,
  userDataPath: string,
  prefetch: RunPrefetch = runPrefetch,
  now = () => new Date(),
): Promise<AcpRegistryInstalledAgent> {
  const { agent, launch } = entry;
  const plan = planAcpRegistryInstall(entry, userDataPath);
  if (!launch || !plan) {
    throw new Error(`${agent.name} has no distribution for this platform`);
  }
  if (launch.kind === "binary" && plan.download) {
    await installBinary(launch.target, plan.download.directory);
  }
  if (plan.prefetch) {
    await prefetch(plan.prefetch);
  }
  return {
    agentId: toAcpRegistryAgentId(agent.registryId),
    registryId: agent.registryId,
    name: agent.name,
    version: agent.version,
    description: agent.description,
    distribution: launch.kind,
    ...plan.launch,
    installedAt: now().toISOString(),
  };
}
