import { describe, expect, it } from "vitest";
import {
  parseProviderJson,
  resolveImportApiKey,
  stripJsonComments,
} from "./parse-provider-json";

const NOW = "2026-01-15T00:00:00.000Z";

const ollamaJson = `{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b", "name": "Qwen Coder", "reasoning": true }
      ]
    }
  }
}`;

describe("stripJsonComments", () => {
  it("removes line comments and trailing commas", () => {
    const raw = `{
      // comment
      "a": 1,
    }`;
    expect(JSON.parse(stripJsonComments(raw))).toEqual({ a: 1 });
  });

  it("keeps // inside strings", () => {
    const raw = `{ "url": "https://example.com//v1" }`;
    expect(JSON.parse(stripJsonComments(raw))).toEqual({
      url: "https://example.com//v1",
    });
  });
});

describe("resolveImportApiKey", () => {
  it("keeps literal keys", () => {
    expect(resolveImportApiKey("sk-test")).toEqual({ apiKey: "sk-test" });
  });

  it("skips env and shell refs", () => {
    expect(resolveImportApiKey("$MY_KEY").apiKey).toBeNull();
    expect(resolveImportApiKey("!op read x").apiKey).toBeNull();
  });
});

describe("parseProviderJson", () => {
  it("parses a minimal pi models.json provider with models", () => {
    const result = parseProviderJson(ollamaJson, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.providers).toHaveLength(1);
    const entry = result.providers[0];
    expect(entry.provider).toMatchObject({
      id: "ollama",
      name: "ollama",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    });
    expect(entry.apiKey).toBe("ollama");
    expect(entry.models).toHaveLength(2);
    expect(entry.models[0]).toMatchObject({
      providerId: "ollama",
      modelId: "llama3.1:8b",
      name: "llama3.1:8b",
      api: "openai-completions",
      source: "manual",
      contextLimit: 128_000,
      outputLimit: 16_384,
      reasoning: false,
    });
    expect(entry.models[1]).toMatchObject({
      modelId: "qwen2.5-coder:7b",
      name: "Qwen Coder",
      reasoning: true,
      capabilities: expect.arrayContaining(["agent", "chat", "reasoning"]),
    });
  });

  it("accepts a bare providers map without the providers wrapper", () => {
    const result = parseProviderJson(
      `{
        "local": {
          "baseUrl": "http://127.0.0.1:8080/v1",
          "api": "openai-completions",
          "models": [{ "id": "m1" }]
        }
      }`,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.providers[0].provider.id).toBe("local");
  });

  it("maps name, headers, compat, cost, and vision input", () => {
    const result = parseProviderJson(
      `{
        "providers": {
          "proxy": {
            "name": "Corp Proxy",
            "baseUrl": "https://proxy.example.com/v1",
            "api": "anthropic-messages",
            "headers": { "x-portkey": "abc" },
            "compat": { "supportsDeveloperRole": false },
            "models": [
              {
                "id": "claude",
                "input": ["text", "image"],
                "contextWindow": 200000,
                "maxTokens": 8192,
                "cost": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 }
              }
            ]
          }
        }
      }`,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const entry = result.providers[0];
    expect(entry.provider.name).toBe("Corp Proxy");
    expect(entry.provider.headersJson).toBe(
      JSON.stringify({ "x-portkey": "abc" }),
    );
    expect(entry.provider.compatJson).toContain("supportsDeveloperRole");
    expect(entry.models[0]).toMatchObject({
      contextLimit: 200_000,
      outputLimit: 8192,
      capabilities: expect.arrayContaining(["vision"]),
    });
    expect(entry.models[0].costJson).toContain('"input":3');
  });

  it("warns and skips env/command api keys", () => {
    const result = parseProviderJson(
      `{
        "providers": {
          "x": {
            "baseUrl": "https://api.example.com",
            "api": "openai-completions",
            "apiKey": "$MY_KEY",
            "models": [{ "id": "m" }]
          }
        }
      }`,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.providers[0].apiKey).toBeNull();
    expect(result.warnings).toContainEqual({
      code: "envApiKey",
      providerId: "x",
    });
  });

  it("allows per-model api when provider api is omitted", () => {
    const result = parseProviderJson(
      `{
        "providers": {
          "mixed": {
            "baseUrl": "https://gateway.example.com",
            "models": [
              { "id": "a", "api": "anthropic-messages" },
              { "id": "b", "api": "openai-completions", "baseUrl": "https://gateway.example.com/openai" }
            ]
          }
        }
      }`,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.providers[0].models[0].api).toBe("anthropic-messages");
    expect(result.providers[0].models[1].baseUrl).toBe(
      "https://gateway.example.com/openai",
    );
  });

  it("rejects missing baseUrl and invalid api", () => {
    expect(
      parseProviderJson(
        `{ "providers": { "x": { "api": "openai-completions", "models": [{ "id": "m" }] } } }`,
        NOW,
      ),
    ).toMatchObject({ ok: false });

    expect(
      parseProviderJson(
        `{
          "providers": {
            "x": {
              "baseUrl": "https://x.com",
              "api": "not-a-real-api",
              "models": [{ "id": "m" }]
            }
          }
        }`,
        NOW,
      ),
    ).toMatchObject({ ok: false });
  });

  it("parses JSON with comments", () => {
    const result = parseProviderJson(
      `{
        // pi models.json
        "providers": {
          "ollama": {
            "baseUrl": "http://localhost:11434/v1",
            "api": "openai-completions",
            "models": [{ "id": "llama" }],
          }
        }
      }`,
      NOW,
    );
    expect(result.ok).toBe(true);
  });
});
