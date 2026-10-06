import {
  ACP_REGISTRY_BUILT_IN_EQUIVALENTS,
  type AcpRegistryCatalogAgent,
  type AcpRegistryDistributionKind,
} from "@cocurdex/shared";
import { EnvHttpProxyAgent, fetch } from "undici";

export const ACP_REGISTRY_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

const REGISTRY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export interface AcpRegistryBinaryTarget {
  archive: string;
  cmd: string;
  args: string[];
  env: Record<string, string>;
  sha256: string | null;
}

export interface AcpRegistryPackageTarget {
  package: string;
  args: string[];
  env: Record<string, string>;
}

export type AcpRegistryLaunchTarget =
  | { kind: "binary"; target: AcpRegistryBinaryTarget }
  | { kind: "npx" | "uvx"; target: AcpRegistryPackageTarget };

export interface AcpRegistryEntry {
  agent: Omit<AcpRegistryCatalogAgent, "installPlan">;
  launch: AcpRegistryLaunchTarget | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readEnv(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function readHttpsUrl(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

export function getAcpRegistryPlatformKey(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
) {
  const os = { darwin: "darwin", linux: "linux", win32: "windows" }[
    platform as "darwin" | "linux" | "win32"
  ];
  const cpu = { arm64: "aarch64", x64: "x86_64" }[arch as "arm64" | "x64"];
  return os && cpu ? `${os}-${cpu}` : null;
}

function readBinaryTarget(
  binary: unknown,
  platformKey: string | null,
): AcpRegistryBinaryTarget | null {
  if (!isRecord(binary) || !platformKey) {
    return null;
  }
  const target = binary[platformKey];
  if (!isRecord(target)) {
    return null;
  }
  const archive = readHttpsUrl(target.archive);
  const cmd = readString(target.cmd);
  if (!archive || !cmd) {
    return null;
  }
  const sha256 = readString(target.sha256)?.toLowerCase() ?? null;
  return {
    archive,
    cmd,
    args: readStringArray(target.args),
    env: readEnv(target.env),
    sha256: sha256 && /^[0-9a-f]{64}$/.test(sha256) ? sha256 : null,
  };
}

function readPackageTarget(value: unknown): AcpRegistryPackageTarget | null {
  if (!isRecord(value)) {
    return null;
  }
  const pkg = readString(value.package);
  return pkg
    ? {
        package: pkg,
        args: readStringArray(value.args),
        env: readEnv(value.env),
      }
    : null;
}

function readLaunchTarget(
  distribution: unknown,
  platformKey: string | null,
): AcpRegistryLaunchTarget | null {
  if (!isRecord(distribution)) {
    return null;
  }
  const binary = readBinaryTarget(distribution.binary, platformKey);
  if (binary) {
    return { kind: "binary", target: binary };
  }
  for (const kind of ["npx", "uvx"] as const) {
    const target = readPackageTarget(distribution[kind]);
    if (target) {
      return { kind, target };
    }
  }
  return null;
}

export function parseAcpRegistry(
  value: unknown,
  platformKey = getAcpRegistryPlatformKey(),
): AcpRegistryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.agents)) {
    throw new Error("ACP Registry returned an unexpected document");
  }
  return value.agents.flatMap((raw): AcpRegistryEntry[] => {
    if (!isRecord(raw)) {
      return [];
    }
    const registryId = readString(raw.id);
    const name = readString(raw.name);
    const version = readString(raw.version);
    if (!registryId || !REGISTRY_ID_PATTERN.test(registryId) || !name) {
      return [];
    }
    if (!version) {
      return [];
    }
    const launch = readLaunchTarget(raw.distribution, platformKey);
    const distribution: AcpRegistryDistributionKind | null =
      launch?.kind ?? null;
    return [
      {
        agent: {
          registryId,
          name,
          version,
          description: readString(raw.description),
          repository: readHttpsUrl(raw.repository),
          website: readHttpsUrl(raw.website),
          iconUrl: readHttpsUrl(raw.icon),
          distribution,
          builtInAgentId: ACP_REGISTRY_BUILT_IN_EQUIVALENTS[registryId] ?? null,
        },
        launch,
      },
    ];
  });
}

export function proxiedFetch(url: string, init: { signal: AbortSignal }) {
  return fetch(url, { ...init, dispatcher: new EnvHttpProxyAgent() });
}

export async function fetchAcpRegistry(
  url = ACP_REGISTRY_URL,
): Promise<AcpRegistryEntry[]> {
  const response = await proxiedFetch(url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`ACP Registry request failed with ${response.status}`);
  }
  return parseAcpRegistry(await response.json());
}
