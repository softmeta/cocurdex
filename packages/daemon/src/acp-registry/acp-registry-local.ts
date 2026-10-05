import { lookupExecutable } from "@cocurdex/agent-core";
import {
  type AcpRegistryInstalledAgent,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";

const LOCAL_CLI_AGENTS: Readonly<
  Record<string, { name: string; command: string; args: string[] }>
> = {
  cursor: { name: "Cursor", command: "cursor-agent", args: ["acp"] },
  devin: { name: "Devin", command: "devin", args: ["acp"] },
  "grok-build": {
    name: "Grok Build",
    command: "grok",
    args: ["agent", "stdio"],
  },
};

export const LOCAL_CLI_REGISTRY_IDS = Object.keys(LOCAL_CLI_AGENTS);

export async function findLocalCliAgent(
  registryId: string,
  lookup: (command: string) => Promise<string | null> = lookupExecutable,
  now = () => new Date(),
): Promise<AcpRegistryInstalledAgent | null> {
  const known = LOCAL_CLI_AGENTS[registryId];
  const command = known ? await lookup(known.command) : null;
  if (!known || !command) {
    return null;
  }
  return {
    agentId: toAcpRegistryAgentId(registryId),
    registryId,
    name: known.name,
    version: "",
    description: null,
    distribution: "local",
    command,
    args: known.args,
    env: {},
    installedAt: now().toISOString(),
  };
}
