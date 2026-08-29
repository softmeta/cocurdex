import { describe, expect, it } from "vitest";
import {
  readAcpSessionModelState,
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
        },
        {
          modelId: "grok-mini",
          name: "Grok Mini",
          description: null,
          contextWindow: 1000,
          defaultReasoningEffort: null,
          reasoningEfforts: [],
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
