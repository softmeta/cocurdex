import {
  type NewSessionContext,
  resolveNewSession,
  resolveNewSessionDefaults,
} from "@cocurdex/daemon/internal/session-control/create-session";
import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionMode,
  AgentRoleRecord,
  CompatibleProviderModel,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-25T00:00:00.000Z";

function agent(
  id: AgentId,
  permissionModes: AgentPermissionMode[],
  availability: AgentDescriptor["availability"] = "available",
): AgentDescriptor {
  return {
    id,
    label: `${id} label`,
    availability,
    capabilities: {
      sessionModes: [],
      permissionModes: permissionModes.map((mode) => ({
        id: mode,
        risk: "normal",
      })),
      writeModes: ["read-only"],
      supportsSteering: false,
      supportsStreaming: true,
      supportsSelections: false,
      sessionTitleStrategy: "app-generated",
      transport: "native",
    },
  };
}

function compatible(
  providerId: string,
  modelId: string,
): CompatibleProviderModel {
  return {
    provider: {
      id: providerId,
      name: providerId,
      baseUrl: `http://127.0.0.1:9/${providerId}`,
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId,
      modelId,
      name: modelId,
      api: "anthropic-messages",
      enabled: true,
      source: "manual",
      capabilities: ["chat"],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function previous(
  agentType: AgentId,
  extra: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id: `previous-${agentType}`,
    workspaceId: "workspace-1",
    title: "Earlier",
    agentType,
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    ...extra,
  };
}

function context(
  overrides: Partial<NewSessionContext> = {},
): NewSessionContext {
  return {
    agents: [
      agent("codex", ["codex-auto"]),
      agent("claude-agent", ["claude-auto", "claude-default"]),
    ],
    workspaceSessions: [],
    compatibleModels: async (agentId) =>
      agentId === "claude-agent"
        ? [
            compatible("anthropic", "claude-sonnet"),
            compatible("anthropic", "claude-haiku-4"),
          ]
        : [compatible("openai", "gpt")],
    defaultModel: async () => null,
    role: null,
    ...overrides,
  };
}

function role(extra: Partial<AgentRoleRecord> = {}): AgentRoleRecord {
  return {
    id: "role-reviewer",
    name: "Reviewer",
    description: null,
    instructions: null,
    skillIds: null,
    avatar: null,
    agentId: "claude-agent",
    providerId: "anthropic",
    modelId: "claude-haiku-4",
    modelName: "claude-haiku-4",
    permissionMode: "claude-default",
    sessionModeId: null,
    reasoningEffort: null,
    serviceTier: null,
    fastMode: null,
    thinkingLevel: null,
    openCodeAgent: null,
    openCodeVariant: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe("resolveNewSession", () => {
  it("continues with the agent, model, and permission mode used last in the workspace", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1" },
      "new-1",
      context({
        workspaceSessions: [
          previous("claude-agent", {
            permissionMode: "claude-default",
            providerSnapshot: {
              providerId: "anthropic",
              providerName: "anthropic",
              modelId: "claude-sonnet",
              modelName: "claude-sonnet",
              api: "anthropic-messages",
              baseUrl: "",
            },
          }),
        ],
      }),
    );

    expect(session).toMatchObject({
      id: "new-1",
      agentType: "claude-agent",
      sessionKind: "main",
      writeMode: "native-write",
      permissionMode: "claude-default",
      providerSnapshot: {
        providerId: "anthropic",
        modelId: "claude-sonnet",
        baseUrl: "http://127.0.0.1:9/anthropic",
      },
    });
  });

  it("prefers the agent's default model over the last one used", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1", agentType: "claude-agent" },
      "new-1",
      context({
        defaultModel: async () => ({
          providerId: "anthropic",
          modelId: "claude-haiku-4",
        }),
      }),
    );

    expect(session.providerSnapshot?.modelId).toBe("claude-haiku-4");
    expect(session.permissionMode).toBe("claude-default");
  });

  it("falls back to the first compatible model when nothing was used or set as default", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1", agentType: "claude-agent" },
      "new-1",
      context({
        defaultModel: async () => ({
          providerId: "anthropic",
          modelId: "retired-model",
        }),
      }),
    );

    expect(session.providerSnapshot).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-sonnet",
    });
  });

  it("refuses a model, agent, or permission mode the computer does not offer", async () => {
    const resolve = (input: Parameters<typeof resolveNewSession>[0]) =>
      resolveNewSession(
        input,
        "new-1",
        context({
          agents: [
            agent("codex", ["codex-auto"]),
            agent("claude-agent", ["claude-auto", "claude-default"]),
            agent("pi", [], "missing"),
          ],
        }),
      );

    await expect(
      resolve({
        workspaceId: "workspace-1",
        agentType: "codex",
        model: { providerId: "anthropic", modelId: "claude-sonnet" },
      }),
    ).rejects.toThrow(/not available for codex/);
    await expect(
      resolve({ workspaceId: "workspace-1", agentType: "pi" }),
    ).rejects.toThrow(/not available on this machine/);
    await expect(
      resolve({
        workspaceId: "workspace-1",
        agentType: "claude-agent",
        model: { providerId: "anthropic", modelId: "claude-haiku-4" },
        permissionMode: "claude-auto",
      }),
    ).rejects.toThrow(/not a permission mode/);
  });

  it("starts without a provider snapshot when the agent has no compatible model", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1", agentType: "codex", title: "  Fix tax  " },
      "new-1",
      context({ compatibleModels: async () => [] }),
    );

    expect(session).toMatchObject({
      title: "Fix tax",
      providerSnapshot: null,
      permissionMode: "codex-auto",
    });
  });
});

describe("resolveNewSession runtime options", () => {
  it("applies the requested effort, thinking level, and speed to the agent's snapshot", async () => {
    const session = await resolveNewSession(
      {
        workspaceId: "workspace-1",
        agentType: "codex",
        runtime: {
          reasoningEffort: "high",
          thinkingLevel: "low",
          serviceTier: "fast",
          openCodeAgent: "build",
        },
      },
      "new-1",
      context(),
    );

    expect(session.providerSnapshot).toMatchObject({
      reasoningEffort: "high",
      thinkingLevel: "low",
      serviceTier: "fast",
      openCodeAgent: null,
    });
  });

  it("treats the default thinking level as unset", async () => {
    const session = await resolveNewSession(
      {
        workspaceId: "workspace-1",
        agentType: "claude-agent",
        runtime: { thinkingLevel: "default", reasoningEffort: "high" },
      },
      "new-1",
      context(),
    );

    expect(session.providerSnapshot).toMatchObject({
      thinkingLevel: null,
      reasoningEffort: null,
    });
  });
});

describe("resolveNewSession with a role", () => {
  it("starts with the role's agent, model, and permission mode and records the role", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1", agentRoleId: "role-reviewer" },
      "new-1",
      context({
        role: role(),
        workspaceSessions: [previous("codex")],
      }),
    );

    expect(session).toMatchObject({
      agentType: "claude-agent",
      agentRoleId: "role-reviewer",
      permissionMode: "claude-default",
      providerSnapshot: { providerId: "anthropic", modelId: "claude-haiku-4" },
    });
  });

  it("starts with the role's runtime options unless the request overrides them", async () => {
    const reviewer = role({
      agentId: "codex",
      providerId: "openai",
      modelId: "gpt",
      permissionMode: null,
      reasoningEffort: "xhigh",
      thinkingLevel: "medium",
    });
    const session = await resolveNewSession(
      {
        workspaceId: "workspace-1",
        agentRoleId: "role-reviewer",
        runtime: { thinkingLevel: "off" },
      },
      "new-1",
      context({ role: reviewer }),
    );

    expect(session.providerSnapshot).toMatchObject({
      reasoningEffort: "xhigh",
      thinkingLevel: "off",
    });
  });

  it("lets explicit choices override the role's preset", async () => {
    const session = await resolveNewSession(
      {
        workspaceId: "workspace-1",
        agentRoleId: "role-reviewer",
        model: { providerId: "anthropic", modelId: "claude-sonnet" },
        permissionMode: "claude-auto",
      },
      "new-1",
      context({ role: role() }),
    );

    expect(session).toMatchObject({
      agentType: "claude-agent",
      agentRoleId: "role-reviewer",
      permissionMode: "claude-auto",
      providerSnapshot: { modelId: "claude-sonnet" },
    });
  });

  it("falls back to the agent's defaults when the role's model is gone", async () => {
    const session = await resolveNewSession(
      { workspaceId: "workspace-1", agentRoleId: "role-reviewer" },
      "new-1",
      context({
        role: role({ modelId: "retired-model", permissionMode: null }),
      }),
    );

    expect(session).toMatchObject({
      agentRoleId: "role-reviewer",
      providerSnapshot: { modelId: "claude-sonnet" },
      permissionMode: "claude-auto",
    });
  });
});

describe("resolveNewSessionDefaults", () => {
  it("reports the choices a new session would get and the modes its model allows", async () => {
    const defaults = await resolveNewSessionDefaults(
      {
        workspaceId: "workspace-1",
        agentType: "claude-agent",
        model: { providerId: "anthropic", modelId: "claude-haiku-4" },
      },
      context(),
    );

    expect(defaults).toEqual({
      agentType: "claude-agent",
      model: {
        providerId: "anthropic",
        modelId: "claude-haiku-4",
        name: "claude-haiku-4",
      },
      permissionMode: "claude-default",
      permissionModes: ["claude-default"],
    });
  });
});
