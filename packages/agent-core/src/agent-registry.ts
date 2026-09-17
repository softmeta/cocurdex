import {
  type AgentSessionMode,
  agentRuntimeAxisCapabilities,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
  PLAN_MODE_ID,
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
  | { executableName: string; kind: "external" };

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
    runtime: { executableName: "cursor-agent", kind: "external" },
    descriptor: {
      id: "cursor",
      label: "Cursor",
      availability: "available",
      capabilities: {
        sessionModes: [],
        permissionModes: getFallbackAgentPermissionModes("cursor"),
        writeModes: ["native-write"],
        supportsSteering: false,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("cursor"),
        transport: "acp",
        runtimeAxes: agentRuntimeAxisCapabilities.cursor,
      },
    },
  },
  {
    runtime: { executableName: "devin", kind: "external" },
    descriptor: {
      id: "devin",
      label: "Devin",
      availability: "available",
      capabilities: {
        sessionModes: [],
        permissionModes: getFallbackAgentPermissionModes("devin"),
        writeModes: ["native-write"],
        supportsSteering: false,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("devin"),
        transport: "acp",
        runtimeAxes: agentRuntimeAxisCapabilities.devin,
      },
    },
  },
  {
    runtime: { executableName: "grok", kind: "external" },
    descriptor: {
      id: "grok-build",
      label: "Grok Build",
      availability: "available",
      capabilities: {
        sessionModes: planSessionModes(),
        permissionModes: getFallbackAgentPermissionModes("grok-build"),
        writeModes: ["native-write"],
        supportsSteering: true,
        supportsStreaming: true,
        supportsSelections: true,
        sessionTitleStrategy: getAgentSessionTitleStrategy("grok-build"),
        transport: "acp",
        runtimeAxes: agentRuntimeAxisCapabilities["grok-build"],
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

function getDefinition(id: AgentDescriptor["id"]) {
  const definition = definitions.find(
    (candidate) => candidate.descriptor.id === id,
  );
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
      return definitions.map((definition) =>
        cloneDescriptor(definition.descriptor),
      );
    },
  };
}
