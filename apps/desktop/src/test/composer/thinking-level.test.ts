import { describe, expect, it } from "vitest";
import {
  getConfigOptionThinkingLevels,
  getEffectiveThinkingLevel,
  getThinkingLevelOptions,
} from "@/features/composer/thinking-level";

const claudeEfforts = [
  { reasoningEffort: "low", description: "low" },
  { reasoningEffort: "medium", description: "medium" },
  { reasoningEffort: "high", description: "high" },
  { reasoningEffort: "xhigh", description: "xhigh" },
  { reasoningEffort: "max", description: "max" },
] as const;

describe("getThinkingLevelOptions", () => {
  it("uses the model-reported effort levels for Claude Agent", () => {
    expect(
      getThinkingLevelOptions({
        agentType: "claude-agent",
        supportedReasoningEfforts: [...claudeEfforts],
        supportsReasoning: true,
      }),
    ).toEqual([
      { level: "low", label: undefined, description: "low", isDefault: false },
      {
        level: "medium",
        label: undefined,
        description: "medium",
        isDefault: false,
      },
      {
        level: "high",
        label: undefined,
        description: "high",
        isDefault: false,
      },
      {
        level: "xhigh",
        label: undefined,
        description: "xhigh",
        isDefault: false,
      },
      { level: "max", label: undefined, description: "max", isDefault: false },
    ]);
  });
});

describe("agent-owned level names", () => {
  it("keeps the label the agent reports for its own effort levels", () => {
    expect(
      getThinkingLevelOptions({
        agentType: "grok-build",
        supportedReasoningEfforts: [
          {
            reasoningEffort: "high",
            description: "Highest implementation quality",
            label: "High Effort",
          },
        ],
        supportsReasoning: true,
      }),
    ).toEqual([
      {
        level: "high",
        label: "High Effort",
        description: "Highest implementation quality",
        isDefault: false,
      },
    ]);
  });
});

describe("devin", () => {
  it("drives the picker from the reported effort list", () => {
    expect(
      getThinkingLevelOptions({
        agentType: "devin",
        supportedReasoningEfforts: [
          { reasoningEffort: "medium", description: "Medium", label: "Medium" },
          { reasoningEffort: "high", description: "High", label: "High" },
          { reasoningEffort: "max", description: "Max", label: "Max" },
        ],
        defaultReasoningEffort: "high",
        supportsReasoning: true,
      }),
    ).toEqual([
      {
        level: "medium",
        label: "Medium",
        description: "Medium",
        isDefault: false,
      },
      { level: "high", label: "High", description: "High", isDefault: true },
      { level: "max", label: "Max", description: "Max", isDefault: false },
    ]);
  });
});

describe("getConfigOptionThinkingLevels", () => {
  const configOptions = [
    {
      id: "mode",
      name: "Session Mode",
      category: "mode",
      type: "select" as const,
      currentValue: "accept-edits",
      options: [{ value: "accept-edits", name: "Code" }],
    },
    {
      id: "thought_level",
      name: "Thinking",
      category: "thought_level",
      type: "select" as const,
      currentValue: "high",
      options: [
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "max", name: "Max" },
      ],
    },
  ];

  it("builds levels from a live thinking config option", () => {
    expect(getConfigOptionThinkingLevels(configOptions)).toEqual([
      { level: "medium", label: "Medium", isDefault: false },
      { level: "high", label: "High", isDefault: true },
      { level: "max", label: "Max", isDefault: false },
    ]);
  });

  it("returns nothing when the session exposes no thinking option", () => {
    expect(getConfigOptionThinkingLevels([configOptions[0]])).toEqual([]);
    expect(getConfigOptionThinkingLevels(null)).toEqual([]);
  });
});

describe("getEffectiveThinkingLevel", () => {
  it("prefers the explicit thinking level for Grok over the legacy effort field", () => {
    expect(getEffectiveThinkingLevel("grok-build", "high", "xhigh")).toBe(
      "xhigh",
    );
  });

  it("falls back to the effort field for older non-Codex sessions", () => {
    expect(getEffectiveThinkingLevel("grok-build", "high", null)).toBe("high");
  });
});
