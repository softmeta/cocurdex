import {
  type AgentId,
  type AgentPermissionMode,
  type AgentProviderSnapshot,
  type AgentThinkingLevel,
  isPlanModeId,
  type ReasoningEffort,
  type SessionRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { agentRuntimeBySessionAtom } from "../agent/runtime/agent-runtime-store";

import {
  agentsAtom,
  getDefaultPermissionMode,
  getDefaultSessionTitle,
  getDefaultWriteMode,
  lastSelectedAgentAtom,
  supportsPermissionMode,
  supportsPermissionModeForModel,
  supportsSessionMode,
} from "./session-agent-state";

import { sessionsAtom } from "./session-navigation-state";

export const updateSessionAgentAtom = atom(
  null,
  (get, set, payload: { sessionId: string; agentType: AgentId }) => {
    set(
      sessionsAtom,
      get(sessionsAtom).map((session) =>
        session.id === payload.sessionId
          ? {
              ...session,
              agentType: payload.agentType,
              title: getDefaultSessionTitle(payload.agentType),
              updatedAt: new Date().toISOString(),
              writeMode: getDefaultWriteMode(payload.agentType),
              sessionModeId: supportsSessionMode(
                get(agentsAtom),
                payload.agentType,
                session.sessionModeId,
              )
                ? session.sessionModeId
                : null,
              permissionMode:
                getDefaultPermissionMode(get(agentsAtom), payload.agentType) ??
                undefined,
            }
          : session,
      ),
    );
    set(lastSelectedAgentAtom, payload.agentType);
  },
);

export const updateSessionModeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      sessionModeId: string | null;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;
    const agents = get(agentsAtom);
    const runtimeModes =
      get(agentRuntimeBySessionAtom)[payload.sessionId]?.mode?.availableModes ??
      [];

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (session.id !== payload.sessionId) {
          return session;
        }
        const known =
          payload.sessionModeId === null ||
          supportsSessionMode(
            agents,
            session.agentType,
            payload.sessionModeId,
          ) ||
          runtimeModes.some((mode) => mode.id === payload.sessionModeId);
        if (!known) {
          return session;
        }

        updatedSession = {
          ...session,
          sessionModeId: payload.sessionModeId,
          permissionMode:
            !isPlanModeId(payload.sessionModeId) &&
            session.permissionMode === "claude-plan"
              ? "claude-default"
              : session.permissionMode,
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession;
  },
);

export const updateSessionPermissionModeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      permissionMode: AgentPermissionMode;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (
          session.id !== payload.sessionId ||
          !supportsPermissionMode(
            get(agentsAtom),
            session.agentType,
            payload.permissionMode,
          ) ||
          !supportsPermissionModeForModel(
            session.agentType,
            payload.permissionMode,
            session.providerSnapshot,
          )
        ) {
          return session;
        }

        updatedSession = {
          ...session,
          permissionMode: payload.permissionMode,
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession;
  },
);

export const updateSessionProviderRuntimeAtom = atom(
  null,
  (
    get,
    set,
    payload: {
      sessionId: string;
      reasoningEffort?: ReasoningEffort | null;
      serviceTier?: string | null;
      fastMode?: boolean | null;
      thinkingLevel?: AgentThinkingLevel | null;
      openCodeAgent?: string | null;
      openCodeVariant?: string | null;
      providerSnapshot?: AgentProviderSnapshot;
    },
  ) => {
    let updatedSession: SessionRecord | null = null;

    set(
      sessionsAtom,
      get(sessionsAtom).map((session) => {
        if (
          session.id !== payload.sessionId ||
          (!session.providerSnapshot && !payload.providerSnapshot)
        ) {
          return session;
        }

        let providerSnapshot = session.providerSnapshot;
        if (payload.providerSnapshot) {
          providerSnapshot = providerSnapshot
            ? { ...providerSnapshot, ...payload.providerSnapshot }
            : payload.providerSnapshot;
        }
        if (!providerSnapshot) {
          return session;
        }

        updatedSession = {
          ...session,
          providerSnapshot: {
            ...providerSnapshot,
            ...(payload.providerSnapshot ?? {}),
            ...("reasoningEffort" in payload
              ? { reasoningEffort: payload.reasoningEffort ?? null }
              : {}),
            ...("serviceTier" in payload
              ? { serviceTier: payload.serviceTier ?? null }
              : {}),
            ...("fastMode" in payload
              ? { fastMode: payload.fastMode ?? null }
              : {}),
            ...("thinkingLevel" in payload
              ? { thinkingLevel: payload.thinkingLevel ?? null }
              : {}),
            ...("openCodeAgent" in payload
              ? { openCodeAgent: payload.openCodeAgent ?? null }
              : {}),
            ...("openCodeVariant" in payload
              ? { openCodeVariant: payload.openCodeVariant ?? null }
              : {}),
          },
          updatedAt: new Date().toISOString(),
        };

        return updatedSession;
      }),
    );

    return updatedSession as SessionRecord | null;
  },
);
