import type { AgentId } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { supportsDocumentAttachments } from "./document-attachment-files";

describe("document attachment adapter support", () => {
  it.each([
    ["claude-agent", true],
    ["grok-build", true],
    ["opencode", true],
    ["codex", false],
    ["pi", false],
  ] satisfies Array<
    [AgentId, boolean]
  >)("%s support is %s", (agentId, expected) => {
    expect(supportsDocumentAttachments(agentId)).toBe(expected);
  });
});
