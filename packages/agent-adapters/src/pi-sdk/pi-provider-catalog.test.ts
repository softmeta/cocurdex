import { describe, expect, it, vi } from "vitest";
import {
  listPiBuiltInProviderIds,
  listPiProviderModels,
  listPiProviderTemplates,
} from "./pi-provider-catalog";

describe("Pi provider catalog", () => {
  it("derives Cocurdex provider templates from Pi builtin providers", () => {
    const templates = listPiProviderTemplates();
    const byId = new Map(templates.map((template) => [template.id, template]));

    expect(byId.get("anthropic")).toMatchObject({
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
    });
    expect(byId.get("openai")).toMatchObject({
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(byId.get("google")).toMatchObject({
      name: "Google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
  });

  it("includes Cocurdex-only built-in templates ahead of the Pi catalog", () => {
    const templates = listPiProviderTemplates();
    const byId = new Map(templates.map((template) => [template.id, template]));

    expect(byId.get("volcengine-plan")).toMatchObject({
      name: "火山 Coding Plan",
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    });
    expect(templates[0]?.id).toBe("volcengine-plan");
    expect(listPiBuiltInProviderIds()).toContain("volcengine-plan");
  });

  it("excludes providers Cocurdex cannot configure or drive yet", () => {
    const ids = new Set(
      listPiProviderTemplates().map((template) => template.id),
    );

    expect(ids.has("amazon-bedrock")).toBe(false);
    expect(ids.has("azure-openai-responses")).toBe(false);
    expect(ids.has("github-copilot")).toBe(false);
    expect(ids.has("google-vertex")).toBe(false);
    expect(ids.has("openai-codex")).toBe(false);
  });

  it("maps Pi models to Cocurdex model records", async () => {
    const models = await listPiProviderModels({ id: "anthropic" });

    expect(models?.[0]).toEqual(
      expect.objectContaining({
        providerId: "anthropic",
        api: "anthropic-messages",
        source: "api",
      }),
    );
    expect(models?.[0]?.capabilities).toContain("agent");
  });

  it("maps Cocurdex built-in Volcengine Coding Plan models", async () => {
    const models = await listPiProviderModels({ id: "volcengine-plan" });

    expect(models?.length).toBeGreaterThan(0);
    expect(models?.[0]).toEqual(
      expect.objectContaining({
        providerId: "volcengine-plan",
        api: "openai-responses",
        source: "api",
      }),
    );
    expect(models?.map((model) => model.modelId)).toEqual(
      expect.arrayContaining([
        "ark-code-latest",
        "doubao-seed-code",
        "glm-5.2",
        "deepseek-v4-pro",
        "kimi-k2.7-code",
      ]),
    );
    const visionModel = models?.find(
      (model) => model.modelId === "ark-code-latest",
    );
    expect(visionModel?.capabilities).toEqual(
      expect.arrayContaining(["agent", "chat", "vision"]),
    );
    const textOnly = models?.find((model) => model.modelId === "glm-5.2");
    expect(textOnly?.capabilities).toEqual(["agent", "chat"]);
    expect(textOnly?.contextLimit).toBe(1_024_000);
  });

  it("keeps models across every supported api for gateway providers", async () => {
    vi.resetModules();
    vi.doMock("@earendil-works/pi-ai/providers/all", () => ({
      builtinProviders: () => [
        {
          auth: { apiKey: {} },
          baseUrl: "https://gateway.test/v1",
          getModels: () => [
            { api: "openai-completions", id: "gpt", input: [], name: "GPT" },
            {
              api: "anthropic-messages",
              id: "claude",
              input: [],
              name: "Claude",
            },
            { api: "openrouter-images", id: "img", input: [], name: "Img" },
          ],
          id: "gateway",
          name: "Gateway",
        },
      ],
      getBuiltinProviders: () => ["gateway"],
    }));

    const { listPiProviderModels: listModels } = await import(
      "./pi-provider-catalog"
    );
    const models = await listModels({ id: "gateway" });

    // Both supported apis survive; the unsupported openrouter-images is dropped.
    expect(models?.map((model) => model.api).sort()).toEqual([
      "anthropic-messages",
      "openai-completions",
    ]);
    vi.doUnmock("@earendil-works/pi-ai/providers/all");
  });

  it("keeps api-key providers with an endpoint, drops the rest", async () => {
    vi.resetModules();
    vi.doMock("@earendil-works/pi-ai/providers/all", () => ({
      builtinProviders: () => [
        {
          auth: { apiKey: {} },
          baseUrl: "https://gateway.test/v1",
          getModels: () => [{ api: "anthropic-messages" }],
          id: "gateway",
          name: "Gateway",
        },
        {
          // No api-key auth: dropped from the template list.
          auth: {},
          baseUrl: "https://oauth.test/v1",
          getModels: () => [{ api: "anthropic-messages" }],
          id: "oauth-only",
          name: "OAuth Only",
        },
      ],
      getBuiltinProviders: () => ["gateway", "oauth-only"],
    }));

    const { listPiProviderTemplates: listTemplates } = await import(
      "./pi-provider-catalog"
    );

    expect(listTemplates()).toEqual([
      {
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
        id: "volcengine-plan",
        name: "火山 Coding Plan",
      },
      {
        baseUrl: "https://gateway.test/v1",
        id: "gateway",
        name: "Gateway",
      },
    ]);
    vi.doUnmock("@earendil-works/pi-ai/providers/all");
  });
});
