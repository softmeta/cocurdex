import type { AgentInfo, ModelInfo } from "@opencode/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertOpenCodeModelAvailable,
  getOpenCodePrimaryAgentIds,
  listOpenCodeProviderModels,
} from "./opencode-models";

const runtimeMocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("./opencode-runtime", async () => {
  const actual =
    await vi.importActual<typeof import("./opencode-runtime")>(
      "./opencode-runtime",
    );
  return {
    ...actual,
    connectOpenCode: runtimeMocks.connect,
    logOpenCode: vi.fn(),
  };
});

function model(overrides: Partial<ModelInfo>): ModelInfo {
  return {
    id: "claude-sonnet",
    modelID: "claude-sonnet",
    providerID: "anthropic",
    name: "Claude Sonnet",
    package: "@ai-sdk/anthropic",
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 64_000 },
    ...overrides,
  };
}

describe("OpenCode model catalog", () => {
  beforeEach(() => {
    runtimeMocks.connect.mockReset();
  });

  it("only exposes visible primary and all-mode agents", () => {
    const agents = [
      { id: "build", hidden: false, mode: "primary" },
      { id: "plan", hidden: false, mode: "primary" },
      { id: "compaction", hidden: true, mode: "primary" },
      { id: "helper", hidden: false, mode: "all" },
      { id: "explore", hidden: false, mode: "subagent" },
    ] as AgentInfo[];

    expect(getOpenCodePrimaryAgentIds(agents)).toEqual([
      "build",
      "plan",
      "helper",
    ]);
  });

  it("maps enabled models with their provider, default, variants, and agents", async () => {
    runtimeMocks.connect.mockResolvedValue({
      model: {
        list: async () => ({
          data: [
            model({ variants: [{ id: "high" }, { id: "max" }] }),
            model({ id: "disabled", enabled: false }),
          ],
        }),
        default: async () => ({
          data: model({}),
        }),
      },
      provider: {
        list: async () => ({
          data: [{ id: "anthropic", name: "Anthropic", package: "" }],
        }),
      },
      agent: {
        list: async () => ({
          data: [{ id: "build", hidden: false, mode: "primary" }],
        }),
      },
    });

    const catalog = await listOpenCodeProviderModels({ forceRefresh: true });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      provider: { id: "anthropic", name: "Anthropic" },
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet",
        api: "anthropic-messages",
        contextLimit: 200_000,
        outputLimit: 64_000,
        isDefault: true,
        compatJson: JSON.stringify({
          opencode: { agents: ["build"], variants: ["high", "max"] },
        }),
      },
    });
  });

  it("rejects when the live catalog cannot be loaded", async () => {
    runtimeMocks.connect.mockRejectedValueOnce(
      new Error("OpenCode service unavailable"),
    );

    await expect(
      listOpenCodeProviderModels({ forceRefresh: true }),
    ).rejects.toThrow("OpenCode service unavailable");
  });

  it("only accepts an enabled model from the selected provider", () => {
    const models = [
      model({}),
      model({ providerID: "other", id: "shared-id" }),
      model({ id: "off", enabled: false }),
    ];

    expect(() =>
      assertOpenCodeModelAvailable(models, {
        providerId: "anthropic",
        modelId: "claude-sonnet",
      }),
    ).not.toThrow();
    expect(() =>
      assertOpenCodeModelAvailable(models, {
        providerId: "anthropic",
        modelId: "shared-id",
      }),
    ).toThrow("is no longer available");
    expect(() =>
      assertOpenCodeModelAvailable(models, {
        providerId: "anthropic",
        modelId: "off",
      }),
    ).toThrow("is no longer available");
  });
});
