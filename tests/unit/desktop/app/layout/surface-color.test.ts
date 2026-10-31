import { describe, expect, it } from "vitest";
import { normalizeCssColorToHex } from "@/app/layout/app-shell/surface-color";

describe("normalizeCssColorToHex", () => {
  it("passes through #rrggbb", () => {
    expect(normalizeCssColorToHex("#0f0f11")).toBe("#0f0f11");
  });

  it("expands #rgb shorthand", () => {
    expect(normalizeCssColorToHex("#abc")).toBe("#aabbcc");
  });

  it("converts legacy rgb()/rgba()", () => {
    expect(normalizeCssColorToHex("rgb(15, 15, 17)")).toBe("#0f0f11");
    expect(normalizeCssColorToHex("rgba(255, 255, 255, 1)")).toBe("#ffffff");
  });

  it("converts modern space-separated rgb()", () => {
    expect(normalizeCssColorToHex("rgb(15 15 17)")).toBe("#0f0f11");
    expect(normalizeCssColorToHex("rgb(15 15 17 / 1)")).toBe("#0f0f11");
  });

  // Regression: Chromium serializes a computed `oklch()` background-color back
  // as `oklch(...)`. The old regex matched only #hex and rgb(), so the dark
  // surface resolved to null and the native window kept its light fallback,
  // flashing white during resize. See app-shell.tsx setWindowSurfaceColor.
  it("converts oklch() to sRGB hex", () => {
    // Pure white theme surface.
    expect(normalizeCssColorToHex("oklch(1 0 0)")).toBe("#ffffff");
    // Dark theme surface should resolve to a near-black hex, not null.
    const dark = normalizeCssColorToHex("oklch(0.145 0 0)");
    expect(dark).not.toBeNull();
    expect(dark).toMatch(/^#0[0-9a-f]0[0-9a-f]0[0-9a-f]$/);
  });

  it("converts oklab() to sRGB hex", () => {
    expect(normalizeCssColorToHex("oklab(1 0 0)")).toBe("#ffffff");
  });

  it("converts color(srgb ...) to hex", () => {
    expect(normalizeCssColorToHex("color(srgb 1 1 1)")).toBe("#ffffff");
    expect(normalizeCssColorToHex("color(srgb 0 0 0)")).toBe("#000000");
  });

  it("returns null for unparseable input", () => {
    expect(normalizeCssColorToHex("")).toBeNull();
    expect(normalizeCssColorToHex("not-a-color")).toBeNull();
  });
});
