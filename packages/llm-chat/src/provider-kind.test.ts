import { describe, expect, it } from "vitest";
import { classifyProvider } from "./provider-kind";

describe("classifyProvider", () => {
  it("maps Pi-native Google runtime to the Google chat adapter", () => {
    expect(
      classifyProvider(
        { baseUrl: "https://example.com" },
        "google-generative-ai",
      ),
    ).toBe("google");
  });

  it("classifies by base URL host", () => {
    expect(
      classifyProvider(
        { baseUrl: "https://api.anthropic.com" },
        "openai-completions",
      ),
    ).toBe("anthropic");
    expect(
      classifyProvider(
        { baseUrl: "https://api.openai.com/v1" },
        "openai-responses",
      ),
    ).toBe("openai");
  });

  it("falls back to openai-compatible for unknown hosts", () => {
    expect(
      classifyProvider(
        { baseUrl: "https://api.together.xyz/v1" },
        "openai-completions",
      ),
    ).toBe("openai-compatible");
  });
});
