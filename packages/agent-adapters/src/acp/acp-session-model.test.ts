import { describe, expect, it } from "vitest";
import {
  baselineAcpSpeedValue,
  isBaselineAcpSpeedValue,
  readAcpModelConfigOptionId,
  readAcpSessionEffortConfig,
  readAcpSessionModelState,
  readAcpSessionSpeedConfig,
  resolveAcpModelId,
  resolveAcpReasoningEffort,
  toAcpReasoningEffort,
} from "./acp-session-model";

// Mirrors a real `session/new` response from `grok agent stdio`.
const grokResponse = {
  sessionId: "sess-1",
  models: {
    currentModelId: "grok-4.5",
    availableModels: [
      {
        modelId: "grok-4.5",
        name: "Grok 4.5",
        _meta: {
          supportsReasoningEffort: true,
          reasoningEffort: "high",
          reasoningEfforts: [
            {
              id: "high",
              value: "high",
              label: "High Effort",
              description: "Highest implementation quality",
              default: true,
            },
            { id: "medium", value: "medium", default: false },
            { id: "low", value: "low", default: false },
          ],
        },
      },
      {
        modelId: "grok-mini",
        name: "Grok Mini",
        _meta: { totalContextTokens: 1000 },
      },
    ],
  },
};

describe("readAcpSessionModelState", () => {
  it("reads the current model and per-model reasoning efforts", () => {
    expect(readAcpSessionModelState(grokResponse)).toEqual({
      currentModelId: "grok-4.5",
      models: [
        {
          modelId: "grok-4.5",
          name: "Grok 4.5",
          description: null,
          contextWindow: null,
          defaultReasoningEffort: "high",
          reasoningEfforts: [
            {
              value: "high",
              label: "High Effort",
              description: "Highest implementation quality",
            },
            { value: "medium", label: null, description: null },
            { value: "low", label: null, description: null },
          ],
          defaultSpeed: null,
          speedOptions: [],
        },
        {
          modelId: "grok-mini",
          name: "Grok Mini",
          description: null,
          contextWindow: 1000,
          defaultReasoningEffort: null,
          reasoningEfforts: [],
          defaultSpeed: null,
          speedOptions: [],
        },
      ],
    });
  });

  it("reads the catalog from an initialize response's _meta.modelState", () => {
    const initializeResponse = {
      protocolVersion: 1,
      _meta: { modelState: grokResponse.models },
    };

    expect(readAcpSessionModelState(initializeResponse)).toEqual(
      readAcpSessionModelState(grokResponse),
    );
  });

  it("returns null when the agent reports no model catalog", () => {
    expect(readAcpSessionModelState({ sessionId: "sess-1" })).toBeNull();
    expect(readAcpSessionModelState(null)).toBeNull();
  });

  it("reads Devin-style model config options", () => {
    expect(
      readAcpSessionModelState({
        sessionId: "successful-ping",
        configOptions: [
          {
            id: "mode",
            category: "mode",
            type: "select",
            currentValue: "ask",
            options: [{ value: "ask", name: "Ask" }],
          },
          {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: "swe-2-high",
            options: [
              { value: "swe-2-high", name: "SWE-2 High" },
              { value: "claude-sonnet-5-high", name: "Claude Sonnet 5 High" },
            ],
          },
        ],
      }),
    ).toEqual({
      currentModelId: "swe-2-high",
      models: [
        {
          modelId: "swe-2-high",
          name: "SWE-2 High",
          description: null,
          contextWindow: null,
          defaultReasoningEffort: null,
          reasoningEfforts: [],
          defaultSpeed: null,
          speedOptions: [],
        },
        {
          modelId: "claude-sonnet-5-high",
          name: "Claude Sonnet 5 High",
          description: null,
          contextWindow: null,
          defaultReasoningEffort: null,
          reasoningEfforts: [],
          defaultSpeed: null,
          speedOptions: [],
        },
      ],
    });
    expect(
      readAcpModelConfigOptionId({
        configOptions: [
          { id: "model", category: "model", type: "select", options: [] },
        ],
      }),
    ).toBe("model");
  });

  it("attaches a session-scoped effort config option to the current model", () => {
    const response = {
      sessionId: "devin-session",
      configOptions: [
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: "swe-2-high",
          options: [
            { value: "swe-2-high", name: "SWE-2" },
            { value: "adaptive", name: "Adaptive" },
          ],
        },
        {
          id: "thought_level",
          name: "Thinking",
          category: "thought_level",
          type: "select",
          currentValue: "high",
          options: [
            { value: "medium", name: "Medium" },
            { value: "high", name: "High" },
            { value: "max", name: "Max" },
          ],
        },
      ],
    };

    expect(readAcpSessionEffortConfig(response)).toEqual({
      configId: "thought_level",
      currentValue: "high",
      options: [
        { value: "medium", label: "Medium", description: null },
        { value: "high", label: "High", description: null },
        { value: "max", label: "Max", description: null },
      ],
    });
    expect(readAcpSessionModelState(response)).toEqual({
      currentModelId: "swe-2-high",
      models: [
        {
          modelId: "swe-2-high",
          name: "SWE-2",
          description: null,
          contextWindow: null,
          defaultReasoningEffort: "high",
          reasoningEfforts: [
            { value: "medium", label: "Medium", description: null },
            { value: "high", label: "High", description: null },
            { value: "max", label: "Max", description: null },
          ],
          defaultSpeed: null,
          speedOptions: [],
        },
        {
          modelId: "adaptive",
          name: "Adaptive",
          description: null,
          contextWindow: null,
          defaultReasoningEffort: null,
          reasoningEfforts: [],
          defaultSpeed: null,
          speedOptions: [],
        },
      ],
    });
  });

  it("ignores unrelated config options when reading the effort axis", () => {
    expect(
      readAcpSessionEffortConfig({
        configOptions: [
          { id: "mode", category: "mode", type: "select", options: [] },
          {
            id: "safe-mode",
            type: "boolean",
            currentValue: true,
          },
        ],
      }),
    ).toBeNull();
    expect(readAcpSessionEffortConfig(null)).toBeNull();
  });

  it("reads Devin's speed config option onto the current model only", () => {
    const response = {
      sessionId: "devin-session",
      configOptions: [
        {
          id: "model",
          category: "model",
          type: "select",
          currentValue: "claude-opus-5-5-medium",
          options: [
            { value: "claude-opus-5-5-medium", name: "Claude Opus 5.5 Medium" },
            { value: "swe-2-high", name: "SWE-2 High" },
          ],
        },
        {
          id: "speed",
          name: "Speed",
          category: "model_config",
          type: "select",
          currentValue: "standard",
          options: [
            { value: "standard", name: "Standard" },
            { value: "fast", name: "Fast" },
          ],
        },
      ],
    };

    expect(readAcpSessionSpeedConfig(response)).toEqual({
      configId: "speed",
      currentValue: "standard",
      options: [
        { value: "standard", label: "Standard", description: null },
        { value: "fast", label: "Fast", description: null },
      ],
    });
    const state = readAcpSessionModelState(response);
    expect(
      state?.models.find((model) => model.modelId === "claude-opus-5-5-medium"),
    ).toMatchObject({
      defaultSpeed: "standard",
      speedOptions: [
        { value: "standard", label: "Standard" },
        { value: "fast", label: "Fast" },
      ],
    });
    // Speed is model-dependent on Devin — it must not leak onto models that
    // never advertised it.
    expect(
      state?.models.find((model) => model.modelId === "swe-2-high"),
    ).toMatchObject({ defaultSpeed: null, speedOptions: [] });
  });
});

describe("baselineAcpSpeedValue", () => {
  const options = [
    { value: "standard", label: "Standard", description: null },
    { value: "fast", label: "Fast", description: null },
  ];

  it("finds the rung the option rests at by default", () => {
    expect(
      baselineAcpSpeedValue({
        configId: "speed",
        currentValue: "standard",
        options,
      }),
    ).toBe("standard");
  });

  it("falls back to the first option when none is a known baseline", () => {
    expect(
      baselineAcpSpeedValue({
        configId: "speed",
        currentValue: null,
        options: [
          { value: "slow", label: null, description: null },
          { value: "fast", label: null, description: null },
        ],
      }),
    ).toBe("slow");
  });
});

describe("isBaselineAcpSpeedValue", () => {
  it("recognizes the default rung spellings", () => {
    expect(isBaselineAcpSpeedValue("standard")).toBe(true);
    expect(isBaselineAcpSpeedValue("normal")).toBe(true);
    expect(isBaselineAcpSpeedValue("Fast")).toBe(false);
  });
});

describe("toAcpReasoningEffort", () => {
  it("maps off to the agent's none effort", () => {
    expect(toAcpReasoningEffort("off")).toBe("none");
    expect(toAcpReasoningEffort("xhigh")).toBe("xhigh");
  });
});

describe("resolveAcpModelId", () => {
  const state = readAcpSessionModelState(grokResponse);

  it("accepts a model advertised by the agent", () => {
    expect(resolveAcpModelId(state, "grok-mini")).toBe("grok-mini");
  });

  it("rejects missing or unadvertised models", () => {
    expect(resolveAcpModelId(state, "unknown-model")).toBeNull();
    expect(resolveAcpModelId(state, "  ")).toBeNull();
    expect(resolveAcpModelId(null, "grok-mini")).toBeNull();
  });
});

describe("resolveAcpReasoningEffort", () => {
  const state = readAcpSessionModelState(grokResponse);

  it("resolves an advertised effort", () => {
    expect(resolveAcpReasoningEffort(state, "grok-4.5", "medium")).toBe(
      "medium",
    );
  });

  it("drops efforts the model does not advertise", () => {
    expect(resolveAcpReasoningEffort(state, "grok-4.5", "xhigh")).toBeNull();
    expect(resolveAcpReasoningEffort(state, "grok-mini", "high")).toBeNull();
  });

  it("drops the effort when model or level is missing", () => {
    expect(resolveAcpReasoningEffort(state, null, "high")).toBeNull();
    expect(resolveAcpReasoningEffort(state, "grok-4.5", undefined)).toBeNull();
    expect(resolveAcpReasoningEffort(null, "grok-4.5", "high")).toBeNull();
  });
});
