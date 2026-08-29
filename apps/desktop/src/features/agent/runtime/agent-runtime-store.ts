import type {
  AgentEvent,
  AgentNegotiatedCapabilities,
  AgentProviderRuntimeSnapshot,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSlashCommand,
} from "@cocurdex/shared";
import { atom } from "jotai";

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

export const agentRuntimeBySessionAtom = atom<
  Record<string, AgentSessionRuntimeState>
>({});

function getSessionRuntime(
  current: Record<string, AgentSessionRuntimeState>,
  sessionId: string,
): AgentSessionRuntimeState {
  return (
    current[sessionId] ?? {
      capabilities: null,
      commands: null,
      configOptions: [],
      mode: null,
      runtime: null,
    }
  );
}

export const applyAgentRuntimeEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (
      event.type !== "capabilities.updated" &&
      event.type !== "commands.updated" &&
      event.type !== "provider.runtime.updated" &&
      event.type !== "session.config.updated" &&
      event.type !== "session.mode.updated"
    ) {
      return;
    }

    const current = get(agentRuntimeBySessionAtom);
    const session = getSessionRuntime(current, event.sessionId);
    let next = session;

    if (event.type === "capabilities.updated") {
      next = { ...session, capabilities: event.capabilities };
    } else if (event.type === "commands.updated") {
      next = { ...session, commands: event.commands };
    } else if (event.type === "provider.runtime.updated") {
      next = { ...session, runtime: event.runtime };
    } else if (event.type === "session.config.updated") {
      next = { ...session, configOptions: event.configOptions };
    } else {
      next = {
        ...session,
        mode: {
          availableModes:
            event.availableModes ?? session.mode?.availableModes ?? [],
          currentModeId: event.currentModeId,
        },
      };
    }

    set(agentRuntimeBySessionAtom, {
      ...current,
      [event.sessionId]: next,
    });
  },
);

export const clearAgentRuntimeForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(agentRuntimeBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;
    set(agentRuntimeBySessionAtom, next);
  },
);
