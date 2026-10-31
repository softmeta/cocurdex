import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPlatformAttribute,
  hasMacTrafficLights,
  isMacPlatform,
} from "@/lib/platform";

const ELECTRON_USER_AGENT =
  "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Electron/38.0.0";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

function stubPlatform(value: string, userAgent = BROWSER_USER_AGENT) {
  vi.stubGlobal("navigator", { platform: value, userAgent } as Navigator);
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

describe("hasMacTrafficLights", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reserves the traffic lights in the macOS desktop app", () => {
    stubPlatform("MacIntel", ELECTRON_USER_AGENT);
    expect(hasMacTrafficLights()).toBe(true);
  });

  it("skips the reserve in a macOS browser tab", () => {
    stubPlatform("MacIntel", BROWSER_USER_AGENT);
    expect(hasMacTrafficLights()).toBe(false);
  });

  it("skips the reserve in the Windows desktop app", () => {
    stubPlatform("Win32", ELECTRON_USER_AGENT);
    expect(hasMacTrafficLights()).toBe(false);
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
