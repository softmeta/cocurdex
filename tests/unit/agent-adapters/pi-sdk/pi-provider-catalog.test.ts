import {
  listPiProviderTemplates,
  mapPiModelsToRecords,
} from "@cocurdex/agent-adapters/internal/pi-sdk/pi-provider-catalog";
import { listPiProviderModels } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-provider-models";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import type { Api, Model } from "@earendil-works/pi-ai";
import { afterAll, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

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

  it("lists every provider Pi can log in to, like Pi's /login", () => {
    const ids = new Set(
      listPiProviderTemplates().map((template) => template.id),
    );

    expect(ids.has("amazon-bedrock")).toBe(true);
    expect(ids.has("azure")).toBe(true);
    expect(ids.has("github-copilot")).toBe(true);
    expect(ids.has("google-vertex")).toBe(true);
    expect(ids.has("openai-codex")).toBe(true);
    expect(
      listPiProviderTemplates().find((item) => item.id === "anthropic")
        ?.authMethods,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "oauth" }),
        expect.objectContaining({ type: "api_key" }),
      ]),
    );
  });

  it("maps Pi models to Cocurdex model records", async () => {
    const models = await listPiProviderModels(
      await tempDirs.create("pi-catalog-"),
      "anthropic",
    );

    expect(models?.[0]).toEqual(
      expect.objectContaining({
        providerId: "anthropic",
        api: "anthropic-messages",
        source: "api",
      }),
    );
    expect(models?.[0]?.capabilities).toContain("agent");
  });

  it("maps the Pi Codex OAuth provider to its native response API", async () => {
    const models = await listPiProviderModels(
      await tempDirs.create("pi-catalog-"),
      "openai-codex",
    );

    expect(models?.length).toBeGreaterThan(0);
    expect(models?.every((item) => item.api === "openai-codex-responses")).toBe(
      true,
    );
  });

  it("drops models whose api Cocurdex cannot drive", () => {
    const model = (api: string, id: string) =>
      ({ api, id, input: [], name: id }) as unknown as Model<Api>;
    const records = mapPiModelsToRecords("gateway", [
      model("openai-completions", "gpt"),
      model("anthropic-messages", "claude"),
      model("openrouter-images", "img"),
    ]);

    expect(records.map((record) => record.api).sort()).toEqual([
      "anthropic-messages",
      "openai-completions",
    ]);
  });

  it("keeps providers with an interactive auth method", async () => {
    vi.resetModules();
    vi.doMock("@earendil-works/pi-ai/providers/all", () => ({
      builtinProviders: () => [
        {
          auth: { apiKey: { login: vi.fn(), name: "Gateway API key" } },
          baseUrl: "https://gateway.test/v1",
          getModels: () => [{ api: "anthropic-messages" }],
          id: "gateway",
          name: "Gateway",
        },
        {
          auth: {
            oauth: {
              isSubscription: true,
              login: vi.fn(),
              name: "OAuth account",
            },
          },
          baseUrl: "https://oauth.test/v1",
          getModels: () => [{ api: "anthropic-messages" }],
          id: "oauth-only",
          name: "OAuth Only",
        },
      ],
      getBuiltinProviders: () => ["gateway", "oauth-only"],
    }));

    const { listPiProviderTemplates: listTemplates } = await import(
      "@cocurdex/agent-adapters/internal/pi-sdk/pi-provider-catalog"
    );

    expect(listTemplates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gateway",
          authMethods: [expect.objectContaining({ type: "api_key" })],
        }),
        expect.objectContaining({
          id: "oauth-only",
          authMethods: [expect.objectContaining({ type: "oauth" })],
        }),
      ]),
    );
    vi.doUnmock("@earendil-works/pi-ai/providers/all");
  });
});
