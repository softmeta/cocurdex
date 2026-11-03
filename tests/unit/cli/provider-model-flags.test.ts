import { parseArgs } from "@cocurdex/cli/internal/parse-args";
import { applyModelFlags } from "@cocurdex/cli/internal/provider-model-commands";
import type { ProviderModelRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const model: ProviderModelRecord = {
  providerId: "xiaomi-token-plan-cn",
  modelId: "mimo-v2.6-flash",
  name: "MiMo-V2.6-Flash",
  api: "openai-completions",
  enabled: true,
  source: "api",
  contextLimit: 1_048_576,
  outputLimit: 131_072,
  capabilities: ["agent", "chat"],
  reasoning: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function apply(args: string[]) {
  return applyModelFlags(model, parseArgs(args));
}

describe("provider model set flags", () => {
  it("changes only the parameters that were passed", () => {
    expect(
      apply([
        "--output",
        "32768",
        "--context",
        "none",
        "--capabilities",
        "chat,vision",
        "--reasoning",
        "off",
        "--disable",
      ]),
    ).toMatchObject({
      api: "openai-completions",
      enabled: false,
      contextLimit: null,
      outputLimit: 32_768,
      capabilities: ["chat", "vision"],
      reasoning: false,
    });
  });

  it("rejects values the daemon would not store", () => {
    expect(() => apply(["--output", "-5"])).toThrow(/positive integer/);
    expect(() => apply(["--capabilities", "chat,teleport"])).toThrow(
      /teleport/,
    );
    expect(() => apply(["--reasoning", "maybe"])).toThrow(/on or off/);
    expect(() => apply(["--api", "made-up"])).toThrow(/--api must be/);
  });
});
