import type {
  AgentEvent,
  AgentNegotiatedCapabilities,
  AgentProviderRuntimeSnapshot,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSlashCommand,
} from "../contracts";

export interface AgentSessionRuntimeState {
  capabilities: AgentNegotiatedCapabilities | null;
  commands: AgentSlashCommand[] | null;
  configOptions: AgentSessionConfigOption[];
  mode: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  runtime: AgentProviderRuntimeSnapshot | null;
}

export const EMPTY_AGENT_SESSION_RUNTIME_STATE: AgentSessionRuntimeState = {
  capabilities: null,
  commands: null,
  configOptions: [],
  mode: null,
  runtime: null,
};

export type SessionRuntimeEvent = Extract<
  AgentEvent,
  {
    type:
      | "capabilities.updated"
      | "commands.updated"
      | "provider.runtime.updated"
      | "session.config.updated"
      | "session.mode.updated";
  }
>;

const RUNTIME_EVENT_TYPES = new Set<string>([
  "capabilities.updated",
  "commands.updated",
  "provider.runtime.updated",
  "session.config.updated",
  "session.mode.updated",
]);

export function isSessionRuntimeEvent(event: {
  type: string;
}): event is SessionRuntimeEvent {
  return RUNTIME_EVENT_TYPES.has(event.type);
}

export function applySessionRuntimeEvent(
  state: AgentSessionRuntimeState,
  event: SessionRuntimeEvent,
): AgentSessionRuntimeState {
  switch (event.type) {
    case "capabilities.updated":
      return { ...state, capabilities: event.capabilities };
    case "commands.updated":
      return { ...state, commands: event.commands };
    case "provider.runtime.updated":
      return { ...state, runtime: event.runtime };
    case "session.config.updated":
      return { ...state, configOptions: event.configOptions };
    case "session.mode.updated":
      return {
        ...state,
        mode: {
          availableModes:
            event.availableModes ?? state.mode?.availableModes ?? [],
          currentModeId: event.currentModeId,
        },
      };
  }
}

export function seedSessionRuntimeState(
  live: AgentSessionRuntimeState | undefined,
  seeded: AgentSessionRuntimeState,
): AgentSessionRuntimeState {
  if (!live) return seeded;
  return {
    capabilities: live.capabilities ?? seeded.capabilities,
    commands: live.commands ?? seeded.commands,
    configOptions:
      live.configOptions.length > 0 ? live.configOptions : seeded.configOptions,
    mode: live.mode ?? seeded.mode,
    runtime: live.runtime ?? seeded.runtime,
  };
}
