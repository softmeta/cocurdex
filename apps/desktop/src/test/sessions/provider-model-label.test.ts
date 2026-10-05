import { describe, expect, it } from "vitest";
import { shouldShowProviderGroupLabels } from "@/features/sessions/provider-model/provider-model-label";

describe("provider model menu display rules", () => {
  it.each([
    ["acp:grok-build", false],
    ["claude-agent", false],
    ["codex", true],
    ["acp:cursor", false],
    ["acp:devin", false],
    ["opencode", true],
    ["pi", true],
  ] as const)("showProviderGroupLabels for %s is %s", (agentId, expected) => {
    expect(shouldShowProviderGroupLabels(agentId)).toBe(expected);
  });
});
