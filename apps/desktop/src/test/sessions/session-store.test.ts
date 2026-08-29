import type { SessionRecord } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { getAgentInputDelivery } from "@/features/agent/follow-up-behavior/follow-up-behavior-types";
import { supportsPlanMode } from "@/features/sessions/collaboration-mode";
import { getDisplaySessionStatus } from "@/features/sessions/session-status";
import {
  agentsAtom,
  applyRefinedSessionTitleAtom,
  bootstrapAgentsAtom,
  bootstrapSessionsAtom,
  createDraftSessionAtom,
  getDefaultPermissionMode,
  getSessionPermissionMode,
  isDefaultSessionTitle,
  lastSelectedAgentAtom,
  sessionsAtom,
  supportsLivePermissionMode,
  supportsPermissionMode,
  updateSessionCollaborationModeAtom,
  updateSessionPermissionModeAtom,
  updateSessionProviderRuntimeAtom,
  updateSessionTitleAtom,
} from "@/features/sessions/session-store";

describe("supportsLivePermissionMode", () => {
  it("allows Claude Agent to apply a new mode on the next turn", () => {
    expect(supportsLivePermissionMode("claude-agent")).toBe(true);
  });
});

const baseSession: SessionRecord = {
  id: "session-1",
  workspaceId: "workspace-1",
  title: "New Codex session",
  agentType: "codex",
  status: "idle",
  writeMode: "read-only",
  collaborationMode: "default",
  createdAt: "2026-05-07T00:00:00.000Z",
  updatedAt: "2026-05-07T00:00:00.000Z",
  lastMessageAt: null,
  permissionMode: "codex-read-only",
};

describe("updateSessionTitleAtom", () => {
  it("updates the matching session title", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [baseSession]);

    store.set(updateSessionTitleAtom, {
      sessionId: baseSession.id,
      title: "Auto Session Names",
      expectedTitle: baseSession.title,
      updatedAt: "2026-05-07T00:01:00.000Z",
    });

    expect(store.get(sessionsAtom)[0]).toMatchObject({
      title: "Auto Session Names",
      updatedAt: "2026-05-07T00:01:00.000Z",
    });
  });

  it("keeps an active turn steerable when provider title refinement returns stale status", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [
      {
        ...baseSession,
        status: "running",
      },
    ]);

    store.set(applyRefinedSessionTitleAtom, {
      expectedTitle: baseSession.title,
      refinedSession: {
        ...baseSession,
        title: "Provider title",
        status: "idle",
        updatedAt: "2026-05-07T00:01:00.000Z",
      },
    });

    const session = store.get(sessionsAtom)[0];
    expect(session).toMatchObject({
      status: "running",
      title: "Provider title",
      updatedAt: "2026-05-07T00:01:00.000Z",
    });
    expect(
      getAgentInputDelivery({
        behavior: "steer",
        isRunning: getDisplaySessionStatus(session?.status, []) === "running",
        supportsSteering: true,
      }),
    ).toBe("steer-active-run");
  });

  it("does not overwrite when the expected title no longer matches", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [
      {
        ...baseSession,
        title: "Manual title",
      },
    ]);

    store.set(updateSessionTitleAtom, {
      sessionId: baseSession.id,
      title: "Provider title",
      expectedTitle: baseSession.title,
    });

    expect(store.get(sessionsAtom)[0]?.title).toBe("Manual title");
  });
});

describe("updateSessionPermissionModeAtom", () => {
  it("keeps plan mode independent from permission changes", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [
      {
        ...baseSession,
        collaborationMode: "plan",
        permissionMode: "codex-read-only",
      },
    ]);

    store.set(updateSessionPermissionModeAtom, {
      sessionId: baseSession.id,
      permissionMode: "codex-auto",
    });

    expect(store.get(sessionsAtom)[0]).toMatchObject({
      collaborationMode: "plan",
      permissionMode: "codex-auto",
    });
  });

  it("rejects Claude Agent auto mode for a Haiku session", () => {
    const store = createStore();
    store.set(
      bootstrapAgentsAtom,
      store.get(agentsAtom).map((agent) =>
        agent.id === "claude-agent"
          ? {
              ...agent,
              capabilities: {
                ...agent.capabilities,
                permissionModes: [
                  { id: "claude-default" as const, risk: "normal" as const },
                  { id: "claude-auto" as const, risk: "elevated" as const },
                ],
              },
            }
          : agent,
      ),
    );
    const haikuSession: SessionRecord = {
      ...baseSession,
      agentType: "claude-agent",
      permissionMode: "claude-default",
      providerSnapshot: {
        providerId: "claude-agent",
        providerName: "Claude Agent",
        modelId: "haiku",
        modelName: "Haiku 4.5",
        api: "anthropic-messages",
        baseUrl: "",
        headersJson: null,
      },
    };
    store.set(bootstrapSessionsAtom, [haikuSession]);

    expect(
      store.set(updateSessionPermissionModeAtom, {
        sessionId: haikuSession.id,
        permissionMode: "claude-auto",
      }),
    ).toBeNull();
    expect(store.get(sessionsAtom)[0]?.permissionMode).toBe("claude-default");
  });
});

describe("updateSessionProviderRuntimeAtom", () => {
  const codexSession: SessionRecord = {
    ...baseSession,
    agentType: "codex",
    providerSnapshot: {
      providerId: "codex",
      providerName: "Codex",
      modelId: "gpt-5.6-luna",
      modelName: "GPT-5.6-Luna",
      api: "openai-responses",
      baseUrl: "",
      reasoningEffort: "medium",
      serviceTier: "flex",
    },
  };

  it("updates only the provided axis", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [codexSession]);

    store.set(updateSessionProviderRuntimeAtom, {
      sessionId: codexSession.id,
      reasoningEffort: "high",
    });

    expect(store.get(sessionsAtom)[0]?.providerSnapshot).toMatchObject({
      reasoningEffort: "high",
      serviceTier: "flex",
    });
  });

  it("clears an axis when null is passed", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [codexSession]);

    store.set(updateSessionProviderRuntimeAtom, {
      sessionId: codexSession.id,
      serviceTier: null,
    });

    expect(store.get(sessionsAtom)[0]?.providerSnapshot).toMatchObject({
      reasoningEffort: "medium",
      serviceTier: null,
    });
  });

  it("persists an explicit adapter thinking level", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [codexSession]);

    store.set(updateSessionProviderRuntimeAtom, {
      sessionId: codexSession.id,
      thinkingLevel: "xhigh",
    });

    expect(store.get(sessionsAtom)[0]?.providerSnapshot).toMatchObject({
      reasoningEffort: "medium",
      serviceTier: "flex",
      thinkingLevel: "xhigh",
    });
  });

  it("hydrates a provider snapshot when a legacy session selects a model", () => {
    const store = createStore();
    const legacyGrokSession = {
      ...baseSession,
      agentType: "grok-build" as const,
      providerSnapshot: null,
    };
    const grokSnapshot = {
      providerId: "grok-build",
      providerName: "Grok Build",
      modelId: "grok-4.5",
      modelName: "Grok 4.5",
      api: "openai-responses" as const,
      baseUrl: "",
    };
    store.set(bootstrapSessionsAtom, [legacyGrokSession]);

    const updatedSession = store.set(updateSessionProviderRuntimeAtom, {
      sessionId: legacyGrokSession.id,
      providerSnapshot: grokSnapshot,
    });

    expect(updatedSession?.providerSnapshot).toMatchObject(grokSnapshot);
    expect(store.get(sessionsAtom)[0]?.providerSnapshot).toMatchObject(
      grokSnapshot,
    );
  });
});

describe("permission mode helpers", () => {
  it("defaults to Pi when no agent has been selected", () => {
    const store = createStore();

    expect(store.get(lastSelectedAgentAtom)).toBe("pi");
    expect(
      store.set(createDraftSessionAtom, { workspaceId: "workspace-1" })
        .agentType,
    ).toBe("pi");
  });

  it("persists last selected agent so the next visit restores it", () => {
    const storageKey = "agents.desktop.last-selected-agent";
    window.localStorage.removeItem(storageKey);

    const store = createStore();
    store.set(lastSelectedAgentAtom, "grok-build");

    expect(window.localStorage.getItem(storageKey)).toBe("grok-build");
    expect(store.get(lastSelectedAgentAtom)).toBe("pi");

    store.set(
      bootstrapAgentsAtom,
      store.get(agentsAtom).map((agent) =>
        agent.id === "grok-build"
          ? {
              ...agent,
              installation: {
                executableName: "grok",
                executablePath: "/usr/bin/grok",
                version: "1.0.0",
              },
            }
          : agent,
      ),
    );
    expect(store.get(lastSelectedAgentAtom)).toBe("grok-build");

    // A later set (e.g. user switches back to built-in cocurdex) overwrites.
    store.set(lastSelectedAgentAtom, "pi");
    expect(window.localStorage.getItem(storageKey)).toBe("pi");
    expect(store.get(lastSelectedAgentAtom)).toBe("pi");
  });

  it("marks the fallback Pi descriptor as streaming", () => {
    const store = createStore();

    expect(
      store.get(agentsAtom).find((agent) => agent.id === "pi")?.capabilities
        .supportsStreaming,
    ).toBe(true);
  });

  it("uses permission modes reported by the agent descriptor", () => {
    const store = createStore();
    const agents = store.get(agentsAtom).map((agent) =>
      agent.id === "claude-agent"
        ? {
            ...agent,
            capabilities: {
              ...agent.capabilities,
              permissionModes: [
                { id: "claude-default" as const, risk: "normal" as const },
                { id: "claude-auto" as const, risk: "elevated" as const },
                {
                  id: "claude-accept-edits" as const,
                  risk: "elevated" as const,
                },
              ],
            },
          }
        : agent,
    );

    expect(getDefaultPermissionMode(agents, "claude-agent")).toBe(
      "claude-default",
    );
    expect(supportsPermissionMode(agents, "claude-agent", "claude-auto")).toBe(
      true,
    );
    expect(
      supportsPermissionMode(
        agents,
        "claude-agent",
        "claude-bypass-permissions",
      ),
    ).toBe(false);
  });

  it("falls back when persisted sessions contain unknown agent ids", () => {
    const agents = createStore().get(agentsAtom);
    const session = {
      ...baseSession,
      agentType: "legacy-agent",
      permissionMode: "codex-auto",
    } as unknown as SessionRecord;

    expect(getDefaultPermissionMode(agents, session.agentType)).toBe(
      "codex-read-only",
    );
    expect(
      supportsPermissionMode(agents, session.agentType, session.permissionMode),
    ).toBe(true);
    expect(getSessionPermissionMode(agents, session)).toBe("codex-auto");
    expect(supportsPlanMode(session.agentType)).toBe(false);
  });

  it("falls back from persisted Claude auto mode when the model is Haiku", () => {
    const agents = createStore()
      .get(agentsAtom)
      .map((agent) =>
        agent.id === "claude-agent"
          ? {
              ...agent,
              capabilities: {
                ...agent.capabilities,
                permissionModes: [
                  { id: "claude-default" as const, risk: "normal" as const },
                  { id: "claude-auto" as const, risk: "elevated" as const },
                ],
              },
            }
          : agent,
      );
    const session: SessionRecord = {
      ...baseSession,
      agentType: "claude-agent",
      permissionMode: "claude-auto",
      providerSnapshot: {
        providerId: "claude-agent",
        providerName: "Claude Agent",
        modelId: "haiku",
        modelName: "Haiku 4.5",
        api: "anthropic-messages",
        baseUrl: "",
        headersJson: null,
      },
    };

    expect(getSessionPermissionMode(agents, session)).toBe("claude-default");
  });
});

describe("updateSessionCollaborationModeAtom", () => {
  it("clears legacy Claude plan permission when plan mode turns off", () => {
    const store = createStore();
    store.set(bootstrapSessionsAtom, [
      {
        ...baseSession,
        agentType: "claude-agent",
        collaborationMode: "plan",
        permissionMode: "claude-plan",
        writeMode: "native-write",
      },
    ]);

    store.set(updateSessionCollaborationModeAtom, {
      sessionId: baseSession.id,
      collaborationMode: "default",
    });

    expect(store.get(sessionsAtom)[0]).toMatchObject({
      collaborationMode: "default",
      permissionMode: "claude-default",
    });
  });
});

describe("isDefaultSessionTitle", () => {
  it("matches default session titles from supported locales", () => {
    expect(isDefaultSessionTitle("New Codex session", "codex")).toBe(true);
    expect(isDefaultSessionTitle("新建 Codex 会话", "codex")).toBe(true);
  });

  it("does not match user-defined titles", () => {
    expect(isDefaultSessionTitle("Investigate session naming", "codex")).toBe(
      false,
    );
  });
});
