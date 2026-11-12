import type { CompatibleProviderModel } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { shouldPersistProviderDefault } from "@/features/new-session/new-session-card-provider-default";
import { getDefaultProviderModelValue } from "@/features/sessions/provider-model/default-provider-model";
import { getProviderModelValue } from "@/features/sessions/provider-model/provider-model-cache";

describe("getDefaultProviderModelValue", () => {
  it("selects the first Claude Agent model when no default is marked", () => {
    const items = [
      {
        provider: {
          id: "claude-agent",
          name: "Claude Agent",
        },
        model: {
          modelId: "sonnet",
          name: "Sonnet 5",
        },
      },
    ] as CompatibleProviderModel[];

    expect(getDefaultProviderModelValue("claude-agent", items, null)).toBe(
      getProviderModelValue("claude-agent", "sonnet"),
    );
  });

  it("selects the Grok Build catalog default", () => {
    const items = [
      {
        provider: {
          id: "acp:grok-build",
          name: "Grok Build",
        },
        model: {
          isDefault: true,
          modelId: "grok-4.5",
          name: "Grok 4.5",
        },
      },
    ] as CompatibleProviderModel[];

    expect(getDefaultProviderModelValue("acp:grok-build", items, null)).toBe(
      getProviderModelValue("acp:grok-build", "grok-4.5"),
    );
  });
});

describe("shouldPersistProviderDefault", () => {
  it.each([
    ["claude-agent", false],
    ["acp:cursor", false],
    ["acp:devin", false],
    ["acp:grok-build", false],
    ["opencode", false],
    ["pi", true],
    ["codex", false],
  ] as const)("returns %s for %s", (agentId, expected) => {
    expect(shouldPersistProviderDefault(agentId)).toBe(expected);
  });
});
