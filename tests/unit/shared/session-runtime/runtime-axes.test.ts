import {
  type AgentSessionConfigOption,
  applySessionRuntime,
  getSessionRuntimeAxes,
  type ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-27T00:00:00.000Z";

function model(extra: Partial<ProviderModelRecord> = {}): ProviderModelRecord {
  return {
    providerId: "openai",
    modelId: "gpt",
    name: "GPT",
    api: "openai-responses",
    enabled: true,
    source: "api",
    capabilities: ["chat"],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const efforts = model({
  supportedReasoningEfforts: [
    { reasoningEffort: "low", description: "Fast" },
    { reasoningEffort: "high", description: "Deep" },
  ],
  defaultReasoningEffort: "low",
  serviceTiers: [{ id: "fast", name: "Fast", description: "Priority" }],
});

describe("getSessionRuntimeAxes", () => {
  it("offers Codex effort and speed, preselecting the model default", () => {
    const axes = getSessionRuntimeAxes("codex", efforts, {});

    expect(axes.thinking).toBeNull();
    expect(axes.effort?.options.map((option) => option.effort)).toEqual([
      "low",
      "high",
    ]);
    expect(axes.effort?.selected).toBe("low");
    expect(axes.speed).toEqual({
      tiers: efforts.serviceTiers,
      selected: null,
    });
  });

  it("ignores a saved effort or tier the model no longer offers", () => {
    const axes = getSessionRuntimeAxes("codex", efforts, {
      reasoningEffort: "xhigh",
      serviceTier: "flex",
    });

    expect(axes.effort?.selected).toBe("low");
    expect(axes.speed?.selected).toBeNull();
  });

  it("offers Claude thinking levels and fast mode only when the model supports them", () => {
    const axes = getSessionRuntimeAxes(
      "claude-agent",
      model({ ...efforts, supportsFastMode: true }),
      { thinkingLevel: "high", fastMode: true },
    );

    expect(axes.effort).toBeNull();
    expect(axes.thinking?.selected).toBe("high");
    expect(axes.fastMode).toBe(true);
    expect(
      getSessionRuntimeAxes("claude-agent", model(), {}).fastMode,
    ).toBeNull();
  });

  it("offers nothing without a model", () => {
    expect(getSessionRuntimeAxes("codex", null, {})).toEqual({
      thinking: null,
      effort: null,
      speed: null,
      fastMode: null,
      openCode: null,
    });
  });
});

describe("applySessionRuntime", () => {
  it("keeps only the axes the agent runs with", () => {
    const snapshot = applySessionRuntime(
      {
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt",
        modelName: "GPT",
        api: "openai-responses",
        baseUrl: "",
      },
      "pi",
      false,
      { reasoningEffort: "high", thinkingLevel: "default", fastMode: true },
    );

    expect(snapshot.thinkingLevel).toBeNull();
    expect(snapshot.reasoningEffort).toBeUndefined();
    expect(snapshot.fastMode).toBeUndefined();
  });
});

describe("getSessionRuntimeAxes with live config options", () => {
  const liveOptions: AgentSessionConfigOption[] = [
    {
      id: "thought_level",
      name: "Thinking",
      type: "select",
      currentValue: "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
      ],
    },
    {
      id: "speed",
      name: "Speed",
      type: "select",
      currentValue: "standard",
      options: [
        { value: "standard", name: "Standard" },
        { value: "turbo", name: "Turbo" },
      ],
    },
  ];

  it("falls back to the session's live thinking and speed options", () => {
    const axes = getSessionRuntimeAxes(
      "acp:devin",
      model(),
      {},
      null,
      liveOptions,
    );

    expect(axes.thinking?.options.map((option) => option.level)).toEqual([
      "low",
      "medium",
    ]);
    expect(axes.thinking?.selected).toBe("medium");
    expect(axes.speed?.tiers.map((tier) => tier.id)).toEqual(["turbo"]);
  });

  it("prefers the model catalog over live options", () => {
    const axes = getSessionRuntimeAxes(
      "claude-agent",
      model({
        supportedReasoningEfforts: [
          { reasoningEffort: "high", description: "Deep" },
          { reasoningEffort: "max", description: "Max" },
        ],
        serviceTiers: [{ id: "fast", name: "Fast", description: "" }],
      }),
      {},
      null,
      liveOptions,
    );

    expect(axes.thinking?.options.map((option) => option.level)).toEqual([
      "high",
      "max",
    ]);
    expect(axes.speed?.tiers.map((tier) => tier.id)).toEqual(["fast"]);
  });
});
