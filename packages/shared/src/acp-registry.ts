import type { AcpRegistryAgentId, BuiltInAgentId } from "./contracts";

export type AcpRegistryDistributionKind = "binary" | "npx" | "uvx" | "local";

export const ACP_REGISTRY_BUILT_IN_EQUIVALENTS: Readonly<
  Record<string, BuiltInAgentId>
> = {
  "claude-acp": "claude-agent",
  "codex-acp": "codex",
  opencode: "opencode",
  "pi-acp": "pi",
};

export interface AcpRegistryLaunchCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AcpRegistryInstallPlan {
  launch: AcpRegistryLaunchCommand;
  download: { url: string; sha256: string | null; directory: string } | null;
  prefetch: AcpRegistryLaunchCommand | null;
}

export interface AcpRegistryCatalogAgent {
  registryId: string;
  name: string;
  version: string;
  description: string | null;
  repository: string | null;
  website: string | null;
  iconUrl: string | null;
  distribution: AcpRegistryDistributionKind | null;
  builtInAgentId: BuiltInAgentId | null;
  installPlan: AcpRegistryInstallPlan | null;
}

export interface AcpRegistryInstalledAgent {
  agentId: AcpRegistryAgentId;
  registryId: string;
  name: string;
  version: string;
  description: string | null;
  distribution: AcpRegistryDistributionKind;
  command: string;
  args: string[];
  env: Record<string, string>;
  installedAt: string;
}

export function toAcpRegistryAgentId(registryId: string): AcpRegistryAgentId {
  return `acp:${registryId}`;
}
