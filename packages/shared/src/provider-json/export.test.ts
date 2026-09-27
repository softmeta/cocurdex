import { describe, expect, it } from "vitest";
import { exportProviderJson } from "./export";
import { parseProviderJson } from "./parse";

const NOW = "2026-01-15T00:00:00.000Z";

const source = `{
  "providers": {
    "gateway": {
      "name": "Gateway",
      "baseUrl": "https://gateway.test/v1",
      "api": "openai-completions",
      "apiKey": "sk-secret",
      "headers": { "x-team": "core" },
      "compat": { "supportsDeveloperRole": false },
      "models": [
        { "id": "small" },
        {
          "id": "vision-large",
          "name": "Vision Large",
          "api": "anthropic-messages",
          "baseUrl": "https://gateway.test/anthropic",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 64000,
          "cost": { "input": 3, "output": 15 },
          "compat": { "supportsStore": false },
          "thinkingLevelMap": { "high": "max" }
        }
      ]
    },
    "empty": { "baseUrl": "http://localhost:1234/v1" }
  }
}`;

function parseOrThrow(json: string) {
  const parsed = parseProviderJson(json, NOW);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.providers;
}

describe("exportProviderJson", () => {
  it("round-trips through the pi models.json parser without secrets", () => {
    const imported = parseOrThrow(source);
    const exported = exportProviderJson(
      imported.map((entry) => entry.provider),
      imported.flatMap((entry) => entry.models),
    );

    expect(JSON.stringify(exported)).not.toContain("sk-secret");
    const reimported = parseOrThrow(JSON.stringify(exported));
    expect(
      reimported.map(({ provider, models }) => ({ provider, models })),
    ).toEqual(imported.map(({ provider, models }) => ({ provider, models })));
  });

  it("keeps models under their own provider", () => {
    const imported = parseOrThrow(source);
    const exported = exportProviderJson(
      imported.map((entry) => entry.provider),
      imported.flatMap((entry) => entry.models),
    );

    expect(exported.providers.empty).toEqual({
      baseUrl: "http://localhost:1234/v1",
      models: [],
    });
    expect(exported.providers.gateway?.models).toHaveLength(2);
  });
});
