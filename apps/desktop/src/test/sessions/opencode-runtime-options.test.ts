import type {
  AgentProviderSnapshot,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  getDefaultOpenCodeAgent,
  getOpenCodeRuntimeOptions,
  resolveOpenCodeRuntimeValue,
} from "@/features/sessions/provider-model/opencode-runtime-options";

function createModel(compatJson: string | null): ProviderModelRecord {
  return { compatJson } as ProviderModelRecord;
}

describe("OpenCode runtime options", () => {
  it("merges namespaced catalog options from the model and session snapshot", () => {
    const options = getOpenCodeRuntimeOptions(
      createModel(
        JSON.stringify({
          opencode: { agents: ["build", "plan"], variants: ["high"] },
        }),
      ),
      {
        modelCompatJson: JSON.stringify({
          opencode: { agents: ["plan", "explore"], variants: ["low"] },
        }),
        providerCompatJson: null,
      } as AgentProviderSnapshot,
    );

    expect(options).toEqual({
      agents: ["build", "plan", "explore"],
      variants: ["high", "low"],
    });
  });

  it("rejects a saved value that is no longer in the catalog", () => {
    expect(resolveOpenCodeRuntimeValue("missing", ["build"])).toBe("");
    expect(resolveOpenCodeRuntimeValue("build", ["build"])).toBe("build");
  });

  it("hides OpenCode's internal default agent sentinel", () => {
    const options = getOpenCodeRuntimeOptions(
      createModel(
        JSON.stringify({
          opencode: { agents: ["default", "build", "plan"] },
        }),
      ),
    );

    expect(options.agents).toEqual(["build", "plan"]);
  });

  it("uses build as the implicit default without adding a default option", () => {
    expect(
      getDefaultOpenCodeAgent({ agents: ["plan", "build"], variants: [] }),
    ).toBe("build");
  });
});
