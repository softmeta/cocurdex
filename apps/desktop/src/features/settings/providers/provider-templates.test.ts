import type {
  ProviderConfigRecord,
  ProviderTemplateRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { applyProviderTemplate } from "./provider-templates";

const anthropic = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com",
} satisfies ProviderTemplateRecord;

const google = {
  id: "google",
  name: "Google",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
} satisfies ProviderTemplateRecord;

function emptyDraft(): ProviderConfigRecord {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    baseUrl: "",
    enabled: true,
    apiKeySecretId: null,
    headersJson: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("applyProviderTemplate", () => {
  it("fills id, name and baseUrl on an empty draft", () => {
    const result = applyProviderTemplate(emptyDraft(), anthropic);
    expect(result.id).toBe("anthropic");
    expect(result.name).toBe("Anthropic");
    expect(result.baseUrl).toBe("https://api.anthropic.com");
  });

  it("keeps a user-typed id and name but always overwrites the endpoint", () => {
    const result = applyProviderTemplate(
      { ...emptyDraft(), id: "my-claude", name: "My Claude", baseUrl: "x" },
      anthropic,
    );
    expect(result.id).toBe("my-claude");
    expect(result.name).toBe("My Claude");
    expect(result.baseUrl).toBe("https://api.anthropic.com");
  });

  it("overwrites id/name auto-filled by a previous template when switching", () => {
    const afterAnthropic = applyProviderTemplate(emptyDraft(), anthropic);
    const afterGoogle = applyProviderTemplate(
      afterAnthropic,
      google,
      anthropic,
    );
    expect(afterGoogle.id).toBe("google");
    expect(afterGoogle.name).toBe("Google");
  });

  it("preserves unrelated draft fields", () => {
    const result = applyProviderTemplate(
      { ...emptyDraft(), apiKeySecretId: "secret", headersJson: "{}" },
      anthropic,
    );
    expect(result.apiKeySecretId).toBe("secret");
    expect(result.headersJson).toBe("{}");
  });
});
