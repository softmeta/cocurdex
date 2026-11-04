import type { ProviderModelRecord } from "@cocurdex/shared";
import {
  applyProviderModelOverride,
  diffProviderModelOverride,
  parseProviderModelOverride,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const catalog: ProviderModelRecord = {
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
  costJson: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("provider model overrides", () => {
  it("keeps only the fields the user changed", () => {
    const edited = {
      ...catalog,
      contextLimit: 262_144,
      capabilities: ["chat", "agent"] as ProviderModelRecord["capabilities"],
      compatJson: '{"supportsDeveloperRole":false}',
      updatedAt: "2026-11-03T00:00:00.000Z",
    };

    expect(diffProviderModelOverride(catalog, edited)).toEqual({
      contextLimit: 262_144,
      compatJson: '{"supportsDeveloperRole":false}',
    });
  });

  it("records a cleared value as an explicit override", () => {
    expect(
      diffProviderModelOverride(catalog, { ...catalog, outputLimit: null }),
    ).toEqual({ outputLimit: null });
  });

  it("returns no override when nothing changed", () => {
    expect(diffProviderModelOverride(catalog, { ...catalog })).toEqual({});
  });

  it("lays overrides over a newer catalog and keeps catalog updates elsewhere", () => {
    const override = diffProviderModelOverride(catalog, {
      ...catalog,
      enabled: false,
      outputLimit: 65_536,
    });
    const newerCatalog = { ...catalog, contextLimit: 2_097_152 };

    expect(applyProviderModelOverride(newerCatalog, override)).toMatchObject({
      enabled: false,
      outputLimit: 65_536,
      contextLimit: 2_097_152,
      overridden: true,
    });
    expect(applyProviderModelOverride(newerCatalog, {})).toBe(newerCatalog);
  });

  it("drops unknown or malformed fields from stored overrides", () => {
    expect(
      parseProviderModelOverride(
        JSON.stringify({
          contextLimit: 4096,
          outputLimit: -1,
          api: "made-up-api",
          capabilities: ["chat", "teleport"],
          reasoning: false,
          name: "Renamed",
        }),
      ),
    ).toEqual({ contextLimit: 4096, reasoning: false });
    expect(parseProviderModelOverride("not json")).toEqual({});
  });
});
