import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import {
  type AcpRegistryInstalledAgent,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import {
  type AcpRegistryBinaryTarget,
  type AcpRegistryEntry,
  proxiedFetch,
} from "./acp-registry-catalog";

const execFileAsync = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

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

async function extract(format: ArchiveFormat, file: string, directory: string) {
  if (format === "zip" && process.platform === "linux") {
    await execFileAsync("unzip", ["-q", "-o", file, "-d", directory]);
    return;
  }
  await execFileAsync("tar", ["-xf", file, "-C", directory], {
    windowsHide: true,
  });
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
    return resolveInstalledCommand(directory, target.cmd);
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

export async function installAcpRegistryAgent(
  entry: AcpRegistryEntry,
  userDataPath: string,
  now = () => new Date(),
): Promise<AcpRegistryInstalledAgent> {
  const { agent, launch } = entry;
  if (!launch) {
    throw new Error(`${agent.name} has no distribution for this platform`);
  }
  const base = {
    agentId: toAcpRegistryAgentId(agent.registryId),
    registryId: agent.registryId,
    name: agent.name,
    version: agent.version,
    description: agent.description,
    distribution: launch.kind,
    env: launch.target.env,
    installedAt: now().toISOString(),
  };
  if (launch.kind !== "binary") {
    return {
      ...base,
      ...packageLaunch(launch.kind, launch.target.package, launch.target.args),
    };
  }
  const directory = path.join(
    getAcpRegistryAgentsRoot(userDataPath),
    agent.registryId,
    agent.version,
  );
  const command = await installBinary(launch.target, directory);
  return { ...base, command, args: launch.target.args };
}
