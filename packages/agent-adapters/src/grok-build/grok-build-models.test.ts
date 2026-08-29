import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpConnection,
  AcpConnectionFactory,
} from "../acp/acp-connection";
import {
  listGrokBuildProviderModels,
  resetGrokBuildProviderModelsCache,
} from "./grok-build-models";

const grok45 = {
  modelId: "grok-4.5",
  name: "Grok 4.5",
  description: "frontier model",
  _meta: {
    totalContextTokens: 500_000,
    supportsReasoningEffort: true,
    reasoningEffort: "high",
    reasoningEfforts: [
      { id: "high", value: "high", default: true },
      { id: "medium", value: "medium", default: false },
      { id: "low", value: "low", default: false },
      // Not in the picker vocabulary — must be dropped.
      { id: "turbo", value: "max", default: false },
    ],
  },
};

const grok46 = {
  modelId: "grok-4.6",
  name: "Grok 4.6",
  description: "latest frontier model",
  _meta: {
    totalContextTokens: 500_000,
    supportsReasoningEffort: true,
    reasoningEffort: "xhigh",
    reasoningEfforts: [
      { id: "xhigh", value: "xhigh", default: true },
      { id: "high", value: "high", default: false },
      { id: "medium", value: "medium", default: false },
      { id: "low", value: "low", default: false },
    ],
  },
};

// `initialize` still reports the bundled snapshot (one model). The live catalog
// is `x.ai/models/list`, which waits for the remote fetch — same as `grok models`.
const initializeResponse = {
  protocolVersion: 1,
  _meta: {
    modelState: {
      currentModelId: "grok-4.5",
      availableModels: [grok45],
    },
  },
};

const listResponse = {
  result: {
    currentModelId: "grok-4.6",
    availableModels: [grok46, grok45],
  },
};

function createFactory(overrides: Partial<AcpConnection> = {}) {
  const close = vi.fn();
  const connection = {
    initialize: vi.fn(async () => initializeResponse),
    extRequest: vi.fn(async () => listResponse),
    // The probe must never open a session: that would persist a real Grok
    // session under ~/.grok/sessions.
    newSession: vi.fn(async () => {
      throw new Error("probe must not call session/new");
    }),
    close,
    ...overrides,
  } as unknown as AcpConnection;

  return {
    close,
    connection,
    factory: vi.fn(async () => connection) as unknown as AcpConnectionFactory,
  };
}

describe("listGrokBuildProviderModels", () => {
  beforeEach(() => {
    resetGrokBuildProviderModelsCache();
  });

  it("builds the catalog from x.ai/models/list after initialize", async () => {
    const { factory, close, connection } = createFactory();

    const items = await listGrokBuildProviderModels(factory);

    expect(connection.extRequest).toHaveBeenCalledWith("x.ai/models/list", {});
    expect(items).toHaveLength(2);
    expect(items[0]?.model).toMatchObject({
      modelId: "grok-4.6",
      name: "Grok 4.6",
      contextLimit: 500_000,
      reasoning: true,
      isDefault: true,
    });
    expect(items[0]?.model.supportedReasoningEfforts).toEqual([
      { reasoningEffort: "xhigh", description: "xhigh", label: null },
      { reasoningEffort: "high", description: "high", label: null },
      { reasoningEffort: "medium", description: "medium", label: null },
      { reasoningEffort: "low", description: "low", label: null },
    ]);
    expect(items[1]?.model).toMatchObject({
      modelId: "grok-4.5",
      name: "Grok 4.5",
      isDefault: false,
    });
    // Probing must not create a Grok session, and the process must not outlive
    // the catalog lookup.
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to the initialize snapshot when models/list is unavailable", async () => {
    const { factory, connection } = createFactory({
      extRequest: vi.fn(async () => {
        throw new Error("models/list not supported");
      }) as unknown as AcpConnection["extRequest"],
    });

    const items = await listGrokBuildProviderModels(factory);

    expect(items).toHaveLength(1);
    expect(items[0]?.model.modelId).toBe("grok-4.5");
    expect(connection.newSession).not.toHaveBeenCalled();
  });

  it("probes once and reuses the resolved catalog", async () => {
    const { factory } = createFactory();

    await listGrokBuildProviderModels(factory);
    await listGrokBuildProviderModels(factory);

    expect(factory).toHaveBeenCalledOnce();
  });

  it("bypasses a resolved catalog when force refreshing", async () => {
    const first = createFactory({
      extRequest: vi.fn(async () => ({
        result: {
          availableModels: [grok45],
          currentModelId: grok45.modelId,
        },
      })) as unknown as AcpConnection["extRequest"],
    });
    const refreshed = createFactory({
      extRequest: vi.fn(async () => ({
        result: {
          availableModels: [grok46],
          currentModelId: grok46.modelId,
        },
      })) as unknown as AcpConnection["extRequest"],
    });

    await listGrokBuildProviderModels(first.factory);
    const items = await listGrokBuildProviderModels(refreshed.factory, {
      forceRefresh: true,
    });

    expect(refreshed.factory).toHaveBeenCalledOnce();
    expect(items.map(({ model }) => model.modelId)).toEqual(["grok-4.6"]);
  });

  it("falls back to the default model when the probe fails", async () => {
    const { factory } = createFactory({
      initialize: vi.fn(async () => {
        throw new Error("grok not authenticated");
      }) as unknown as AcpConnection["initialize"],
    });

    const items = await listGrokBuildProviderModels(factory);

    expect(items).toHaveLength(1);
    expect(items[0]?.model.modelId).toBe("grok-4.6");
    expect(items[0]?.model.supportedReasoningEfforts).toHaveLength(4);
  });

  it("does not cache the fallback so a later call can still probe", async () => {
    const failing = createFactory({
      initialize: vi.fn(async () => {
        throw new Error("grok not installed");
      }) as unknown as AcpConnection["initialize"],
    });
    await listGrokBuildProviderModels(failing.factory);

    const healthy = createFactory();
    const items = await listGrokBuildProviderModels(healthy.factory);

    expect(healthy.factory).toHaveBeenCalledOnce();
    expect(items[0]?.model.contextLimit).toBe(500_000);
  });
});
