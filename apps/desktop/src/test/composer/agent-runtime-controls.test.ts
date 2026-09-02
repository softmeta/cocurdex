import { describe, expect, it } from "vitest";
import {
  getComposerSessionConfigOptions,
  getSessionConfigTriggerValues,
} from "@/features/composer/agent-runtime-controls";

const grokOccupied = ["model", "thinking", "mode", "permission"] as const;

describe("agent runtime config rows", () => {
  it("drops ACP options that the session menu already owns", () => {
    const options = [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select" as const,
        currentValue: "grok-code",
        options: [{ value: "grok-code", name: "Grok Code" }],
      },
      {
        id: "reasoning",
        name: "Reasoning",
        type: "select" as const,
        currentValue: "medium",
        options: [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
        ],
      },
      {
        id: "mode",
        name: "Mode",
        type: "select" as const,
        currentValue: "default",
        options: [{ value: "default", name: "Default" }],
      },
      {
        id: "web-search",
        name: "Web search",
        type: "boolean" as const,
        currentValue: true,
      },
      {
        id: "safety",
        name: "Safety",
        type: "select" as const,
        currentValue: "standard",
        options: [{ value: "standard", name: "Standard" }],
      },
    ];

    expect(
      getComposerSessionConfigOptions(options, grokOccupied).map(
        (option) => option.id,
      ),
    ).toEqual(["web-search", "safety"]);
    expect(
      getSessionConfigTriggerValues(options, grokOccupied, ["Medium"]),
    ).toEqual(["Standard"]);
  });
});
