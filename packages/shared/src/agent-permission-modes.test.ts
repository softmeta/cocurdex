import { describe, expect, it } from "vitest";
import { isAgentPermissionModeSupportedForModel } from "./agent-permission-modes";

describe("isAgentPermissionModeSupportedForModel", () => {
  it("rejects Claude Agent auto mode for Haiku aliases and versioned models", () => {
    expect(
      isAgentPermissionModeSupportedForModel(
        "claude-agent",
        "claude-auto",
        "haiku",
      ),
    ).toBe(false);
    expect(
      isAgentPermissionModeSupportedForModel(
        "claude-agent",
        "claude-auto",
        "claude-haiku-4-5-20251001",
      ),
    ).toBe(false);
  });

  it("keeps Claude Agent auto mode available for Fable, Sonnet, and Opus", () => {
    for (const modelId of ["fable", "sonnet", "opus"]) {
      expect(
        isAgentPermissionModeSupportedForModel(
          "claude-agent",
          "claude-auto",
          modelId,
        ),
      ).toBe(true);
    }
  });

  it("does not constrain other Claude permission modes or agents", () => {
    expect(
      isAgentPermissionModeSupportedForModel(
        "claude-agent",
        "claude-default",
        "haiku",
      ),
    ).toBe(true);
    expect(
      isAgentPermissionModeSupportedForModel(
        "grok-build",
        "grok-auto",
        "haiku",
      ),
    ).toBe(true);
  });
});
