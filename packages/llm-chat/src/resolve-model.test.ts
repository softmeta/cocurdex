import { describe, expect, it } from "vitest";
import {
  buildLanguageModelHeaders,
  normalizeAnthropicBaseUrl,
} from "./resolve-model";

describe("buildLanguageModelHeaders", () => {
  it("preserves explicit headers", () => {
    expect(
      buildLanguageModelHeaders({
        headersJson: JSON.stringify({ "x-custom-header": "custom-value" }),
      }),
    ).toEqual({
      "x-custom-header": "custom-value",
    });
  });

  it("preserves explicit Authorization headers", () => {
    expect(
      buildLanguageModelHeaders({
        headersJson: JSON.stringify({ authorization: "Bearer custom" }),
      }),
    ).toEqual({
      authorization: "Bearer custom",
    });
  });

  it("ignores invalid header JSON", () => {
    expect(buildLanguageModelHeaders({ headersJson: "{" })).toBeUndefined();
  });
});

describe("normalizeAnthropicBaseUrl", () => {
  it("adds v1 for Ark Coding Plan Anthropic-compatible base URLs", () => {
    expect(
      normalizeAnthropicBaseUrl("https://ark.cn-beijing.volces.com/api/coding"),
    ).toBe("https://ark.cn-beijing.volces.com/api/coding/v1");
  });

  it("does not duplicate v1 for custom Anthropic-compatible base URLs", () => {
    expect(
      normalizeAnthropicBaseUrl(
        "https://ark.cn-beijing.volces.com/api/coding/v1/",
      ),
    ).toBe("https://ark.cn-beijing.volces.com/api/coding/v1");
  });

  it("leaves official Anthropic base URLs unchanged", () => {
    expect(normalizeAnthropicBaseUrl("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1",
    );
  });

  it("adds v1 to official Anthropic base URLs missing it", () => {
    expect(normalizeAnthropicBaseUrl("https://api.anthropic.com")).toBe(
      "https://api.anthropic.com/v1",
    );
  });

  it("returns empty string for empty base URLs", () => {
    expect(normalizeAnthropicBaseUrl("")).toBe("");
  });
});
