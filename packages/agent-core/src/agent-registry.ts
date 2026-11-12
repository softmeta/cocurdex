import {
  type AcpRegistryInstalledAgent,
  getAcpRegistryId,
  getBuiltInAgentDescriptor,
  getFallbackAgentCapabilities,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { AgentDescriptor } from "./agent-types";

export type AgentRuntimeOwnership =
  | { kind: "builtin" }
  | { executableName: string; kind: "external"; version?: string };

interface AgentDefinition {
  descriptor: AgentDescriptor;
  runtime: AgentRuntimeOwnership;
}

const definitions: AgentDefinition[] = [
  {
    runtime: { executableName: "claude", kind: "external" },
    descriptor: getBuiltInAgentDescriptor("claude-agent"),
  },
  {
    runtime: { executableName: "codex", kind: "external" },
    descriptor: getBuiltInAgentDescriptor("codex"),
  },
  {
    runtime: { executableName: "opencode", kind: "external" },
    descriptor: getBuiltInAgentDescriptor("opencode"),
  },
  {
    runtime: { kind: "builtin" },
    descriptor: getBuiltInAgentDescriptor("pi"),
  },
];

function cloneDescriptor(descriptor: AgentDescriptor): AgentDescriptor {
  return {
    ...descriptor,
    capabilities: {
      ...descriptor.capabilities,
      sessionModes: descriptor.capabilities.sessionModes.map((mode) => ({
        ...mode,
      })),
      permissionModes: descriptor.capabilities.permissionModes.map((mode) => ({
        ...mode,
      })),
      writeModes: [...descriptor.capabilities.writeModes],
      runtimeAxes: descriptor.capabilities.runtimeAxes
        ? { ...descriptor.capabilities.runtimeAxes }
        : descriptor.capabilities.runtimeAxes,
    },
    installation: descriptor.installation
      ? { ...descriptor.installation }
      : descriptor.installation,
  };
}

let acpRegistryAgents: AcpRegistryInstalledAgent[] = [];

export function setInstalledAcpRegistryAgents(
  agents: readonly AcpRegistryInstalledAgent[],
) {
  acpRegistryAgents = agents.map((agent) => ({ ...agent }));
}

export function getInstalledAcpRegistryAgent(id: AgentDescriptor["id"]) {
  return acpRegistryAgents.find((agent) => agent.agentId === id) ?? null;
}

function toAcpRegistryDefinition(
  agent: AcpRegistryInstalledAgent,
): AgentDefinition {
  return {
    runtime: {
      executableName: agent.command,
      kind: "external",
      ...(agent.distribution === "local" ? {} : { version: agent.version }),
    },
    descriptor: {
      id: agent.agentId,
      label: agent.name,
      availability: "available",
      capabilities: getFallbackAgentCapabilities(agent.agentId),
    },
  };
}

function allDefinitions() {
  return [...definitions, ...acpRegistryAgents.map(toAcpRegistryDefinition)];
}

function getDefinition(id: AgentDescriptor["id"]) {
  const definition = allDefinitions().find(
    (candidate) => candidate.descriptor.id === id,
  );
  const registryId = getAcpRegistryId(id);
  if (!definition && registryId) {
    const placeholder = toAcpRegistryDefinition({
      agentId: toAcpRegistryAgentId(registryId),
      registryId,
      name: registryId,
      version: "",
      description: null,
      distribution: "binary",
      command: registryId,
      args: [],
      env: {},
      installedAt: "",
    });
    return {
      ...placeholder,
      descriptor: { ...placeholder.descriptor, availability: "missing" },
    } satisfies AgentDefinition;
  }
  if (!definition) {
    throw new Error(`Unknown agent: ${id}`);
  }
  return definition;
}

export function getAgentDescriptor(id: AgentDescriptor["id"]) {
  return cloneDescriptor(getDefinition(id).descriptor);
}

export function getAgentRuntimeOwnership(id: AgentDescriptor["id"]) {
  return getDefinition(id).runtime;
}

export function createAgentRegistry() {
  return {
    list() {
      return allDefinitions().map((definition) =>
        cloneDescriptor(definition.descriptor),
      );
    },
  };
}
