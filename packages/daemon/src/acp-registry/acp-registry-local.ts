import { lookupExecutable, readExecutableVersion } from "@cocurdex/agent-core";
import {
  type AcpRegistryInstalledAgent,
  compareAgentVersions,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";

interface LocalCliAgent {
  name: string;
  command: string;
  args: string[];
  /** The first release that serves ACP through this command. */
  minimumVersion?: string;
}

const LOCAL_CLI_AGENTS: Readonly<Record<string, LocalCliAgent>> = {
  "antigravity-acp": {
    name: "Google Antigravity",
    command: "agy",
    args: ["acp"],
    minimumVersion: "1.5.0",
  },
  cursor: { name: "Cursor", command: "cursor-agent", args: ["acp"] },
  devin: { name: "Devin", command: "devin", args: ["acp"] },
  "grok-build": {
    name: "Grok Build",
    command: "grok",
    args: ["agent", "stdio"],
  },
};

export const LOCAL_CLI_REGISTRY_IDS = Object.keys(LOCAL_CLI_AGENTS);

const LOCAL_CLI_CACHE_TTL_MS = 5_000;

let cachedWindow: {
  expiresAt: number;
  path: string | undefined;
  pathExt: string | undefined;
  probes: Map<
    string,
    Promise<Omit<AcpRegistryInstalledAgent, "installedAt"> | null>
  >;
} | null = null;

async function probeLocalCliAgent(
  registryId: string,
  lookup: (command: string) => Promise<string | null>,
  readVersion: (command: string) => Promise<string | null>,
): Promise<Omit<AcpRegistryInstalledAgent, "installedAt"> | null> {
  const known = LOCAL_CLI_AGENTS[registryId];
  const command = known ? await lookup(known.command) : null;
  if (!known || !command) {
    return null;
  }
  let version = "";
  if (known.minimumVersion) {
    const parsed = await readVersion(command);
    if (!parsed || compareAgentVersions(parsed, known.minimumVersion) < 0) {
      return null;
    }
    version = parsed;
  }
  return {
    agentId: toAcpRegistryAgentId(registryId),
    registryId,
    name: known.name,
    version,
    description: null,
    distribution: "local",
    command,
    args: known.args,
    env: {},
  };
}

export async function findLocalCliAgent(
  registryId: string,
  lookup: (command: string) => Promise<string | null> = lookupExecutable,
  now = () => new Date(),
  readVersion: (
    command: string,
  ) => Promise<string | null> = readExecutableVersion,
): Promise<AcpRegistryInstalledAgent | null> {
  if (lookup !== lookupExecutable || readVersion !== readExecutableVersion) {
    const probed = await probeLocalCliAgent(registryId, lookup, readVersion);
    return probed ? { ...probed, installedAt: now().toISOString() } : null;
  }
  const time = performance.now();
  const { PATH: path, PATHEXT: pathExt } = process.env;
  if (
    !cachedWindow ||
    time >= cachedWindow.expiresAt ||
    path !== cachedWindow.path ||
    pathExt !== cachedWindow.pathExt
  ) {
    cachedWindow = {
      expiresAt: time + LOCAL_CLI_CACHE_TTL_MS,
      path,
      pathExt,
      probes: new Map(),
    };
  }
  const window = cachedWindow;
  let pending = window.probes.get(registryId);
  if (!pending) {
    pending = probeLocalCliAgent(registryId, lookup, readVersion).catch(
      (error: unknown) => {
        window.probes.delete(registryId);
        throw error;
      },
    );
    window.probes.set(registryId, pending);
  }
  const probed = await pending;
  return probed ? { ...probed, installedAt: now().toISOString() } : null;
}
