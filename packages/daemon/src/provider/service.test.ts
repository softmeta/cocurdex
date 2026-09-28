import type {
  CompatibleProviderModel,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderCredentials } from "../provider-credentials/service";
import type { DaemonState } from "../state";

const listCodexProviderModelsMock = vi.hoisted(() => vi.fn());
const listOpenCodeProviderModelsMock = vi.hoisted(() => vi.fn());
const listClaudeCliProviderModelsMock = vi.hoisted(() => vi.fn());
const listCursorProviderModelsMock = vi.hoisted(() => vi.fn());
const listDevinProviderModelsMock = vi.hoisted(() => vi.fn());
const listGrokBuildProviderModelsMock = vi.hoisted(() => vi.fn());
const listPiProviderModelsMock = vi.hoisted(() => vi.fn());
const listPiBuiltInProviderIdsMock = vi.hoisted(() => vi.fn());
const listPiProviderTemplatesMock = vi.hoisted(() => vi.fn());
const generatePiConversationTitleMock = vi.hoisted(() => vi.fn());
const probeDevinProviderModelAxesMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/agent-adapters", () => ({
  generatePiConversationTitle: generatePiConversationTitleMock,
  listClaudeCliProviderModels: listClaudeCliProviderModelsMock,
  listCodexProviderModels: listCodexProviderModelsMock,
  listCursorProviderModels: listCursorProviderModelsMock,
  listDevinProviderModels: listDevinProviderModelsMock,
  listGrokBuildProviderModels: listGrokBuildProviderModelsMock,
  listOpenCodeProviderModels: listOpenCodeProviderModelsMock,
  listPiBuiltInProviderIds: listPiBuiltInProviderIdsMock,
  listPiProviderModels: listPiProviderModelsMock,
  listPiProviderTemplates: listPiProviderTemplatesMock,
  probeDevinProviderModelAxes: probeDevinProviderModelAxesMock,
}));

import { DaemonProviderService } from "./service";

const codexModels = [
  {
    provider: {
      id: "codex",
      name: "Codex",
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    model: {
      providerId: "codex",
      modelId: "gpt-5.5",
      name: "GPT-5.5",
      api: "openai-responses",
      enabled: true,
      source: "api",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
] as unknown as CompatibleProviderModel[];

function createState(overrides: Partial<DaemonState> = {}) {
  return {
    listProviderConfigs: vi.fn(async () => []),
    listProviderModels: vi.fn(async () => []),
    ...overrides,
  } as unknown as DaemonState;
}

function createCredentials() {
  return {
    readApiKey: vi.fn(async () => null),
    setApiKey: vi.fn(async () => {}),
    readAuthState: vi.fn(),
    logout: vi.fn(async () => {}),
  } as unknown as ProviderCredentials;
}

describe("DaemonProviderService", () => {
  beforeEach(() => {
    listCodexProviderModelsMock.mockReset();
    listPiBuiltInProviderIdsMock.mockReset().mockReturnValue([]);
    listPiProviderModelsMock.mockReset();
  });

  it("combines the Codex catalog with compatible provider models", async () => {
    listCodexProviderModelsMock.mockResolvedValue(codexModels);
    const service = new DaemonProviderService(
      createState(),
      createCredentials(),
    );

    await expect(
      service.listCompatibleProviderModels("codex"),
    ).resolves.toEqual(codexModels);
    expect(listCodexProviderModelsMock).toHaveBeenCalledOnce();
  });

  it("returns only the Claude CLI catalog for claude-agent", async () => {
    const claudeModels = [] as unknown as CompatibleProviderModel[];
    listClaudeCliProviderModelsMock.mockResolvedValue(claudeModels);
    const state = createState();
    const service = new DaemonProviderService(state, createCredentials());

    await expect(
      service.listCompatibleProviderModels("claude-agent"),
    ).resolves.toBe(claudeModels);
    expect(state.listProviderConfigs).not.toHaveBeenCalled();
  });

  it("forwards forced refreshes to adapter-owned catalogs", async () => {
    listGrokBuildProviderModelsMock.mockResolvedValue([]);
    const service = new DaemonProviderService(
      createState(),
      createCredentials(),
    );

    await service.listCompatibleProviderModels("grok-build", {
      forceRefresh: true,
    });

    expect(listGrokBuildProviderModelsMock).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
    });

    listCursorProviderModelsMock.mockResolvedValue([]);
    await service.listCompatibleProviderModels("cursor", {
      forceRefresh: true,
    });
    expect(listCursorProviderModelsMock).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
    });

    listDevinProviderModelsMock.mockResolvedValue([]);
    await service.listCompatibleProviderModels("devin", { forceRefresh: true });
    expect(listDevinProviderModelsMock).toHaveBeenCalledWith(undefined, {
      forceRefresh: true,
    });
  });

  it("probes Devin's per-model axes on demand and not for other agents", async () => {
    const axes = {
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: [],
      serviceTiers: [{ id: "fast", name: "Fast", description: "" }],
    };
    probeDevinProviderModelAxesMock.mockResolvedValue(axes);
    const service = new DaemonProviderService(
      createState(),
      createCredentials(),
    );

    await expect(
      service.probeAgentModelAxes("devin", "claude-opus-5-5-medium"),
    ).resolves.toBe(axes);
    expect(probeDevinProviderModelAxesMock).toHaveBeenCalledWith(
      "claude-opus-5-5-medium",
    );

    probeDevinProviderModelAxesMock.mockReset();
    await expect(
      service.probeAgentModelAxes("codex", "gpt-5.5"),
    ).resolves.toBeNull();
    expect(probeDevinProviderModelAxesMock).not.toHaveBeenCalled();
  });

  it("swallows probe failures so the picker keeps working without axes", async () => {
    probeDevinProviderModelAxesMock.mockRejectedValue(
      new Error("spawn failed"),
    );
    const service = new DaemonProviderService(
      createState(),
      createCredentials(),
    );

    await expect(
      service.probeAgentModelAxes("devin", "swe-2-high"),
    ).resolves.toBeNull();
  });

  it("validates the persisted model before saving an agent default", async () => {
    const saveAgentProviderDefault = vi.fn();
    const service = new DaemonProviderService(
      createState({ saveAgentProviderDefault }),
      createCredentials(),
    );

    await expect(
      service.setAgentProviderDefault("pi", "missing", "model-x"),
    ).rejects.toThrow("Provider model not found");
    expect(saveAgentProviderDefault).not.toHaveBeenCalled();
  });

  describe("signed-out built-in providers", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const providerConfig = (id: string) => ({
      id,
      name: id,
      baseUrl: "https://example.test",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    });
    const providerModel = (providerId: string): ProviderModelRecord => ({
      providerId,
      modelId: `${providerId}-model`,
      name: `${providerId}-model`,
      api: "openai-completions",
      enabled: true,
      source: "api",
      contextLimit: null,
      outputLimit: null,
      createdAt: now,
      updatedAt: now,
    });

    function createService() {
      listPiBuiltInProviderIdsMock.mockReturnValue([
        "openai-codex",
        "anthropic",
      ]);
      listPiProviderModelsMock.mockImplementation(
        async (provider: { id: string }) => [providerModel(provider.id)],
      );
      const credentials = createCredentials();
      vi.mocked(credentials.readAuthState).mockImplementation(
        async (providerId) => ({
          providerId,
          type: providerId === "anthropic" ? "oauth" : null,
          origin: providerId === "anthropic" ? "stored" : null,
          source: null,
        }),
      );
      const state = createState({
        listProviderConfigs: vi.fn(async () => [
          providerConfig("openai-codex"),
          providerConfig("anthropic"),
          providerConfig("custom"),
        ]),
        getProviderConfig: vi.fn(async (id: string) => providerConfig(id)),
        listProviderModels: vi.fn(async (providerId?: string) =>
          providerId && providerId !== "custom"
            ? []
            : [providerModel("custom")],
        ),
      });
      return new DaemonProviderService(state, credentials);
    }

    it("hides their models from the configured model list", async () => {
      const models = await createService().listAllModels({
        forceRefresh: true,
      });

      expect(models.map((model) => model.providerId).sort()).toEqual([
        "anthropic",
        "custom",
      ]);
    });

    it("leaves them out of an agent's model picker entirely", async () => {
      const items = await createService().listCompatibleProviderModels("pi", {
        forceRefresh: true,
      });

      expect(items.map((item) => item.provider.id).sort()).toEqual([
        "anthropic",
        "custom",
      ]);
    });

    it("returns no catalog models when refreshing them", async () => {
      await expect(
        createService().fetchModels("openai-codex"),
      ).resolves.toEqual({
        models: [],
        error: null,
      });
    });
  });

  it("rejects malformed title model selections", async () => {
    const service = new DaemonProviderService(
      createState(),
      createCredentials(),
    );

    await expect(
      service.setTitleModel({ providerId: 1 } as never),
    ).rejects.toThrow("Invalid title model selection");
  });
});
