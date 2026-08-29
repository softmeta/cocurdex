import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPlatformAttribute, isMacPlatform } from "@/lib/platform";

function stubPlatform(value: string) {
  vi.stubGlobal("navigator", { platform: value } as Navigator);
}

describe("isMacPlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects macOS", () => {
    stubPlatform("MacIntel");
    expect(isMacPlatform()).toBe(true);
  });

  it("returns false on Windows", () => {
    stubPlatform("Win32");
    expect(isMacPlatform()).toBe(false);
  });
});

describe("applyPlatformAttribute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks macOS so CSS can skip styled native scrollbars", () => {
    stubPlatform("MacIntel");
    const root = document.createElement("html");
    applyPlatformAttribute(root);
    expect(root.dataset.platform).toBe("darwin");
  });

  it("marks other platforms for the thin styled scrollbar", () => {
    stubPlatform("Win32");
    const root = document.createElement("html");
    applyPlatformAttribute(root);
    expect(root.dataset.platform).toBe("other");
  });
});
