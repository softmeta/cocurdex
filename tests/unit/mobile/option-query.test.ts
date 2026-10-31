import { matchesQuery } from "@cocurdex/mobile/internal/ui/option-query";
import { describe, expect, it } from "vitest";

const model = { label: "GPT-4.1 mini", supporting: "OpenAI" };

describe("matchesQuery", () => {
  it("shows every option while the query is blank", () => {
    expect(matchesQuery(model, "  ")).toBe(true);
  });

  it("matches the name regardless of case", () => {
    expect(matchesQuery(model, "4.1 MINI")).toBe(true);
  });

  it("matches the provider shown under the name", () => {
    expect(matchesQuery(model, "openai")).toBe(true);
  });

  it("hides options that match neither", () => {
    expect(matchesQuery(model, "deepseek")).toBe(false);
  });
});
