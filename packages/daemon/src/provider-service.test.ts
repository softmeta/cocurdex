import type { CompatibleProviderModel } from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonState } from "./state";

const listCodexProviderModelsMock = vi.hoisted(() => vi.fn());

vi.mock("@cocurdex/agent-adapters", () => ({
  listCodexProviderModels: listCodexProviderModelsMock,
  listOpenCodeProviderModels: vi.fn(),
}));

import { DaemonProviderService } from "./provider-service";

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

describe("DaemonProviderService", () => {
  beforeEach(() => {
    listCodexProviderModelsMock.mockReset();
  });

  it("uses the Codex-owned catalog without reading provider settings", async () => {
    listCodexProviderModelsMock.mockResolvedValue(codexModels);
    const state = {
      listProviderConfigs: vi.fn(),
      listProviderModels: vi.fn(),
    } as unknown as DaemonState;
    const service = new DaemonProviderService(state);

    await expect(service.listCompatibleProviderModels("codex")).resolves.toBe(
      codexModels,
    );
    expect(listCodexProviderModelsMock).toHaveBeenCalledOnce();
    expect(state.listProviderConfigs).not.toHaveBeenCalled();
    expect(state.listProviderModels).not.toHaveBeenCalled();
  });
});
