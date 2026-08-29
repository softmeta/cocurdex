import { describe, expect, it } from "vitest";
import { shouldRevalidateProviderModels } from "./provider-model-cache";

describe("provider model cache revalidation", () => {
  it("always revalidates the OpenCode catalog while rendering cached models", () => {
    expect(shouldRevalidateProviderModels("opencode", true, false)).toBe(true);
  });

  it("does not repeatedly revalidate an OpenCode catalog verified at runtime", () => {
    expect(shouldRevalidateProviderModels("opencode", true, true)).toBe(false);
  });

  it("revalidates every persisted adapter-owned catalog once per runtime", () => {
    expect(shouldRevalidateProviderModels("codex", true, false)).toBe(true);
    expect(shouldRevalidateProviderModels("grok-build", true, false)).toBe(
      true,
    );
    expect(shouldRevalidateProviderModels("pi", true, false)).toBe(false);
  });

  it("revalidates stale catalogs for every agent", () => {
    expect(shouldRevalidateProviderModels("codex", false, true)).toBe(true);
  });
});
