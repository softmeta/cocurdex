import type {
  AgentProviderSnapshot,
  ProviderConfigRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCredentials } from "./service";

const resolveAuth = vi.hoisted(() => vi.fn());
vi.mock("@cocurdex/agent-adapters/provider-auth", () => ({
  resolvePiProviderAuth: resolveAuth,
  registerBundledPiProviderOAuthFlows: vi.fn(),
}));

beforeEach(() => resolveAuth.mockReset().mockResolvedValue(undefined));

function fixture() {
  const config: ProviderConfigRecord = {
    id: "custom",
    name: "Custom",
    baseUrl: "https://example.invalid",
    enabled: true,
    apiKeySecretId: null,
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
  };
  const secrets = new Map<string, string>();
  const vault = {
    read: vi.fn(async (id: string) => secrets.get(id) ?? null),
    write: vi.fn(async (id: string, value: string) => {
      secrets.set(id, value);
    }),
    remove: vi.fn(async (id: string) => {
      secrets.delete(id);
    }),
  };
  const state = {
    getProviderConfig: vi.fn(async (id: string) =>
      id === config.id ? config : null,
    ),
    setProviderApiKeySecretId: vi.fn(
      async (_id: string, secretId: string | null) => {
        config.apiKeySecretId = secretId;
      },
    ),
  };
  const service = new ProviderCredentials(state, "/unused", vault);
  const snapshot: AgentProviderSnapshot = {
    providerId: config.id,
    providerName: config.name,
    modelId: "model",
    modelName: "Model",
    api: "openai-completions",
    baseUrl: config.baseUrl,
    headersJson: JSON.stringify({ "x-existing": "yes" }),
  };
  return { service, state, config, vault, secrets, snapshot };
}

describe("daemon provider credentials", () => {
  it("preserves provider-native model snapshots without requiring an app-managed provider", async () => {
    const { service, vault, snapshot } = fixture();
    await expect(
      service.resolveSnapshot({ ...snapshot, providerId: "native-provider" }),
    ).resolves.toMatchObject({
      providerId: "native-provider",
      modelId: snapshot.modelId,
      apiKey: null,
    });
    expect(vault.read).not.toHaveBeenCalled();
    expect(resolveAuth).not.toHaveBeenCalled();
  });
  it("treats clearing a key for an unsaved provider as already cleared", async () => {
    const { service, vault, state } = fixture();
    await expect(service.setApiKey("deepseek", null)).resolves.toBeUndefined();
    expect(vault.remove).not.toHaveBeenCalled();
    expect(state.setProviderApiKeySecretId).not.toHaveBeenCalled();
    await expect(service.setApiKey("deepseek", "sk-test")).rejects.toThrow(
      "Provider not found",
    );
  });

  it("stores only a credential reference in product state and resolves the current key", async () => {
    const { service, config, secrets, snapshot } = fixture();
    await service.setApiKey(config.id, "first-key");
    expect(config.apiKeySecretId).toBeTruthy();
    expect(config.apiKeySecretId).not.toBe("first-key");
    expect(secrets.get(config.apiKeySecretId as string)).toBe("first-key");
    await service.setApiKey(config.id, "rotated-key");
    expect(await service.resolveSnapshot(snapshot)).toMatchObject({
      apiKey: "rotated-key",
    });
    await service.setApiKey(config.id, null);
    expect(secrets.size).toBe(0);
    expect(config.apiKeySecretId).toBeNull();
  });

  it("applies refreshed OAuth headers and endpoint before stored API keys", async () => {
    const { service, config, vault, snapshot } = fixture();
    config.apiKeySecretId = "stored-secret";
    resolveAuth.mockResolvedValue({
      auth: {
        apiKey: "oauth-token",
        baseUrl: "https://oauth.example.invalid",
        headers: { "x-account": "account" },
      },
    });
    const runtime = await service.resolveSnapshot(snapshot);
    expect(runtime).toMatchObject({
      apiKey: "oauth-token",
      baseUrl: "https://oauth.example.invalid",
      modelBaseUrl: "https://oauth.example.invalid",
    });
    expect(JSON.parse(runtime.headersJson as string)).toEqual({
      "x-existing": "yes",
      "x-account": "account",
    });
    expect(vault.read).not.toHaveBeenCalled();
  });

  it("rejects a missing configured key instead of falling back to stored ciphertext", async () => {
    const { service, config, snapshot } = fixture();
    config.apiKeySecretId = "missing";
    await expect(service.resolveSnapshot(snapshot)).rejects.toThrow(
      "API key is missing",
    );
    await expect(service.readApiKey(config.id)).resolves.toBeNull();
  });

  it("does not publish a reference after a failed vault write or clear it after a failed deletion", async () => {
    const { service, config, vault, state } = fixture();
    vault.write.mockRejectedValueOnce(new Error("Locked"));
    await expect(service.setApiKey(config.id, "key")).rejects.toThrow("Locked");
    expect(state.setProviderApiKeySecretId).not.toHaveBeenCalled();
    config.apiKeySecretId = "existing";
    vault.remove.mockRejectedValueOnce(new Error("Locked"));
    await expect(service.setApiKey(config.id, null)).rejects.toThrow("Locked");
    expect(config.apiKeySecretId).toBe("existing");
  });

  it("removes an unreferenced key when product state cannot save the reference", async () => {
    const { service, config, secrets, state } = fixture();
    state.setProviderApiKeySecretId.mockRejectedValueOnce(
      new Error("Database failure"),
    );
    await expect(service.setApiKey(config.id, "key")).rejects.toThrow(
      "Database failure",
    );
    expect(secrets.size).toBe(0);
  });

  it("leaves native Codex credentials to its adapter", async () => {
    const { service, state, snapshot } = fixture();
    await expect(
      service.forSession({
        agentType: "codex",
        providerSnapshot: snapshot,
      } as SessionRecord),
    ).resolves.toBeNull();
    expect(state.getProviderConfig).not.toHaveBeenCalled();
    expect(resolveAuth).not.toHaveBeenCalled();
  });
});
