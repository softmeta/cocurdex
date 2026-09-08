import { describe, expect, it, vi } from "vitest";
import { createMonacoLanguageLoader } from "./monaco-language-loader";

describe("Monaco language loading", () => {
  it("loads only requested languages and shares concurrent initialization", async () => {
    const loadLanguage = vi.fn(async () => {});
    const load = createMonacoLanguageLoader({ loadLanguage });

    await load("plaintext");
    expect(loadLanguage).not.toHaveBeenCalled();
    const first = load("typescript");
    expect(load("typescript")).toBe(first);
    await first;
    await load("typescript");
    expect(loadLanguage).toHaveBeenCalledExactlyOnceWith("typescript");

    await load("python");
    expect(loadLanguage).toHaveBeenLastCalledWith("python");
  });

  it("retries failed language loading without marking it ready", async () => {
    const loadLanguage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to load grammar"))
      .mockResolvedValue(undefined);
    const load = createMonacoLanguageLoader({ loadLanguage });

    await expect(load("astro")).rejects.toThrow("Failed to load grammar");
    await load("astro");
    expect(loadLanguage).toHaveBeenCalledTimes(2);
  });
});
