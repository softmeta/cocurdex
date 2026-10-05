import {
  type AcpRegistryInstalledAgent,
  type AgentSessionMode,
  agentRuntimeAxisCapabilities,
  getAcpAgentProfile,
  getAcpRegistryId,
  getAgentRuntimeAxisCapabilities,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
  PLAN_MODE_ID,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { AgentDescriptor } from "./agent-types";

function planSessionModes(): AgentSessionMode[] {
  return [
    { id: "default", name: "Default" },
    { id: PLAN_MODE_ID, name: "Plan" },
  ];
}

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
    descriptor: {
      id: "claude-agent",
      label: "Claude Agent",
      availability: "available",
      capabilities: {
        sessionModes: planSessionModes(),
        permissionModes: getFallbackAgentPermissionModes("claude-agent"),
        writeModes: ["read-only", "native-write"],
        supportsSteering: true,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("claude-agent"),
        transport: "native",
        runtimeAxes: agentRuntimeAxisCapabilities["claude-agent"],
      },
    },
  },
  {
    runtime: { executableName: "codex", kind: "external" },
    descriptor: {
      id: "codex",
      label: "Codex",
      availability: "available",
      capabilities: {
        sessionModes: planSessionModes(),
        permissionModes: getFallbackAgentPermissionModes("codex"),
        writeModes: ["read-only", "native-write"],
        supportsSteering: true,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("codex"),
        transport: "native",
        runtimeAxes: agentRuntimeAxisCapabilities.codex,
      },
    },
  },
  {
    runtime: { executableName: "opencode", kind: "external" },
    descriptor: {
      id: "opencode",
      label: "OpenCode",
      availability: "available",
      capabilities: {
        sessionModes: planSessionModes(),
        permissionModes: getFallbackAgentPermissionModes("opencode"),
        writeModes: ["read-only", "native-write"],
        supportsSteering: false,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("opencode"),
        transport: "native",
        runtimeAxes: agentRuntimeAxisCapabilities.opencode,
      },
    },
  },
  {
    runtime: { kind: "builtin" },
    descriptor: {
      id: "pi",
      label: "Pi",
      availability: "available",
      capabilities: {
        sessionModes: [],
        permissionModes: getFallbackAgentPermissionModes("pi"),
        writeModes: ["read-only"],
        supportsSteering: true,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("pi"),
        transport: "native",
        runtimeAxes: agentRuntimeAxisCapabilities.pi,
      },
    },
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
  const profile = getAcpAgentProfile(agent.agentId);
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
      capabilities: {
        sessionModes: profile.sessionModes ?? [],
        permissionModes: getFallbackAgentPermissionModes(agent.agentId),
        writeModes: ["native-write"],
        supportsSteering: profile.supportsSteering ?? false,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: "native",
        transport: "acp",
        runtimeAxes: getAgentRuntimeAxisCapabilities(agent.agentId),
      },
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
