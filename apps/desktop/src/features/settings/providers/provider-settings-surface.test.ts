import { describe, expect, it } from "vitest";
import { resolveProviderSettingsSurface } from "./provider-settings-surface";

describe("resolveProviderSettingsSurface", () => {
  it("keeps create mode even when a provider id is selected", () => {
    expect(
      resolveProviderSettingsSurface({
        isCreatingProvider: true,
        pendingTemplateId: "anthropic",
        providerIds: ["openai"],
        selectedProviderId: "openai",
      }),
    ).toEqual({ kind: "create", templateId: "anthropic" });
  });

  it("falls back to the first configured provider", () => {
    expect(
      resolveProviderSettingsSurface({
        isCreatingProvider: false,
        pendingTemplateId: "",
        providerIds: ["openai", "google"],
        selectedProviderId: "missing",
      }),
    ).toEqual({ kind: "provider", id: "openai" });
  });

  it("falls back to the empty surface when nothing is configured", () => {
    expect(
      resolveProviderSettingsSurface({
        isCreatingProvider: false,
        pendingTemplateId: "",
        providerIds: [],
        selectedProviderId: null,
      }),
    ).toEqual({ kind: "empty" });
  });
});
