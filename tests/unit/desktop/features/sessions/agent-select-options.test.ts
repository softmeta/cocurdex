import { describe, expect, it } from "vitest";
import {
  type AgentSelectOption,
  visibleAgentSelectOptions,
} from "@/features/sessions/agent-select-options";

const options: AgentSelectOption[] = [
  { value: "pi", label: "Pi", statusKind: "builtin" },
  { value: "codex", label: "Codex", statusKind: "missing", selectable: false },
  { value: "opencode", label: "OpenCode", statusKind: "missing" },
  { value: "claude-agent", label: "Claude", statusKind: "outdated" },
  { value: "acp:grok-build", label: "Grok", statusKind: "error" },
  { value: "acp:devin", label: "Devin", statusKind: "detecting" },
];

describe("visibleAgentSelectOptions", () => {
  it("hides uninstalled agents but keeps ones that need attention", () => {
    expect(
      visibleAgentSelectOptions(options, "pi").map((option) => option.value),
    ).toEqual(["pi", "claude-agent", "acp:grok-build", "acp:devin"]);
  });

  it("keeps the current agent visible after it is uninstalled", () => {
    expect(
      visibleAgentSelectOptions(options, "codex").map((option) => option.value),
    ).toContain("codex");
  });
});
