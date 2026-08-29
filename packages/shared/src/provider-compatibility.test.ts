import { describe, expect, it } from "vitest";
import type {
  AgentId,
  CompatibleProviderModel,
  ProviderApi,
} from "./contracts";
import {
  filterCompatibleProviderModels,
  getCompatibleProviderApis,
  isChatCapableModel,
  isChatSupportedApi,
} from "./provider-compatibility";

function item(
  api: ProviderApi,
  capabilities?: CompatibleProviderModel["model"]["capabilities"],
): CompatibleProviderModel {
  return {
    provider: {
      id: api,
      name: api,
      baseUrl: "",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
    model: {
      providerId: api,
      modelId: api,
      name: api,
      api,
      enabled: true,
      source: "manual",
      contextLimit: null,
      outputLimit: null,
      capabilities,
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
  };
}

describe("filterCompatibleProviderModels", () => {
  it("keeps Codex on Responses-compatible models only", () => {
    const models = filterCompatibleProviderModels("codex", [
      item("openai-completions"),
      item("openai-responses"),
      item("anthropic-messages"),
    ]);

    expect(models.map(({ model }) => model.api)).toEqual(["openai-responses"]);
  });

  it("lets Pi use app-managed provider apis", () => {
    expect(
      filterCompatibleProviderModels("pi", [
        item("openai-completions"),
        item("openai-responses"),
        item("anthropic-messages"),
        item("google-generative-ai"),
      ]).map(({ model }) => model.api),
    ).toEqual([
      "openai-completions",
      "openai-responses",
      "anthropic-messages",
      "google-generative-ai",
    ]);
  });

  // Sessions persist agentType, so an id from an older or newer build reaches
  // this lookup; an undefined api list crashed every caller filtering models
  // for that session.
  it("drops every model for an unknown agent id", () => {
    const unknown = "retired-agent" as AgentId;

    expect(getCompatibleProviderApis(unknown)).toEqual([]);
    expect(
      filterCompatibleProviderModels(unknown, [item("openai-responses")]),
    ).toEqual([]);
  });

  it("hides models that lack the agent capability", () => {
    const models = filterCompatibleProviderModels("pi", [
      item("openai-completions", ["chat"]),
      item("openai-responses", ["agent", "chat"]),
      item("anthropic-messages", []),
      item("google-generative-ai", ["chat", "vision"]),
    ]);

    expect(models.map(({ model }) => model.api)).toEqual([
      "openai-responses",
      "anthropic-messages",
    ]);
  });
});

describe("chat picker helpers", () => {
  it("keeps app-managed provider apis available to chat", () => {
    expect(isChatSupportedApi("openai-completions")).toBe(true);
    expect(isChatSupportedApi("anthropic-messages")).toBe(true);
    expect(isChatSupportedApi("google-generative-ai")).toBe(true);
  });

  it("treats undeclared capabilities as chat-capable", () => {
    expect(isChatCapableModel(undefined)).toBe(true);
    expect(isChatCapableModel([])).toBe(true);
    expect(isChatCapableModel(["chat"])).toBe(true);
    expect(isChatCapableModel(["agent"])).toBe(false);
  });
});
