import { resolveRuntimeUpdate } from "@cocurdex/daemon/internal/session-control/update-runtime";
import type {
  AgentProviderSnapshot,
  CompatibleProviderModel,
  ProviderModelRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-27T00:00:00.000Z";

function compatible(
  modelId: string,
  extra: Partial<ProviderModelRecord> = {},
): CompatibleProviderModel {
  return {
    provider: {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "http://127.0.0.1:9/anthropic",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId: "anthropic",
      modelId,
      name: modelId,
      api: "anthropic-messages",
      enabled: true,
      source: "manual",
      capabilities: ["chat"],
      createdAt: now,
      updatedAt: now,
      ...extra,
    },
  };
}

const snapshot: AgentProviderSnapshot = {
  providerId: "anthropic",
  providerName: "Anthropic",
  modelId: "claude-sonnet",
  modelName: "claude-sonnet",
  api: "anthropic-messages",
  baseUrl: "http://127.0.0.1:9/anthropic",
  thinkingLevel: "high",
  fastMode: true,
};

function session(extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Review totals",
    agentType: "claude-agent",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    permissionMode: "claude-auto",
    providerSnapshot: snapshot,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    ...extra,
  };
}

const context = {
  compatibleModels: [
    compatible("claude-sonnet", { supportsFastMode: true }),
    compatible("claude-haiku-4"),
  ],
  permissionModes: ["claude-auto" as const, "claude-default" as const],
};

describe("resolveRuntimeUpdate", () => {
  it("changes runtime options on the current model and keeps the rest", () => {
    const next = resolveRuntimeUpdate(
      session(),
      { sessionId: "session-1", runtime: { thinkingLevel: "low" } },
      context,
    );

    expect(next.providerSnapshot).toMatchObject({
      modelId: "claude-sonnet",
      thinkingLevel: "low",
      fastMode: true,
    });
    expect(next).toMatchObject({
      workspaceId: "workspace-1",
      permissionMode: "claude-auto",
    });
  });

  it("switches the model, carries the thinking level, and leaves a permission mode it does not support", () => {
    const next = resolveRuntimeUpdate(
      session(),
      {
        sessionId: "session-1",
        model: { providerId: "anthropic", modelId: "claude-haiku-4" },
      },
      context,
    );

    expect(next.providerSnapshot).toMatchObject({
      modelId: "claude-haiku-4",
      thinkingLevel: "high",
    });
    expect(next.providerSnapshot?.fastMode).toBeNull();
    expect(next.permissionMode).toBe("claude-default");
  });

  it("refuses a model the agent cannot use and an archived session", () => {
    expect(() =>
      resolveRuntimeUpdate(
        session(),
        {
          sessionId: "session-1",
          model: { providerId: "openai", modelId: "gpt" },
        },
        context,
      ),
    ).toThrow(/not available/);
    expect(() =>
      resolveRuntimeUpdate(
        session({ archivedAt: now }),
        { sessionId: "session-1" },
        context,
      ),
    ).toThrow(/Restore/);
  });
});
