import { codeFenceLanguage } from "@cocurdex/mobile/internal/files/source-language";
import { describe, expect, it } from "vitest";

describe("codeFenceLanguage", () => {
  it("accepts shiki language names regardless of case", () => {
    expect(codeFenceLanguage("TypeScript")).toBe("typescript");
  });

  it("maps file extensions and common aliases", () => {
    expect(codeFenceLanguage("ts")).toBe("typescript");
    expect(codeFenceLanguage("golang")).toBe("go");
    expect(codeFenceLanguage(" shell ")).toBe("shellscript");
  });

  it("returns null for unknown or empty fences", () => {
    expect(codeFenceLanguage("")).toBeNull();
    expect(codeFenceLanguage("mermaid")).toBeNull();
  });
});
