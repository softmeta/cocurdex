import { describe, expect, it } from "vitest";
import { assertUpdateArchitecture } from "./update-architecture";

const intelOnly = { files: [{ url: "Cocurdex-mac-x64.zip" }] };
const both = {
  files: [...intelOnly.files, { url: "Cocurdex-mac-arm64.zip" }],
};

describe("Mac update architecture", () => {
  it.each([
    { platform: "darwin", arch: "arm64", translated: false },
    { platform: "darwin", arch: "x64", translated: true },
  ])("blocks Intel-only updates on Apple Silicon: %j", (host) => {
    expect(() => assertUpdateArchitecture(intelOnly, host)).toThrow(
      "missing Cocurdex-mac-arm64.zip",
    );
    expect(() => assertUpdateArchitecture(both, host)).not.toThrow();
  });

  it("requires a native ZIP even when an arm64 DMG is present", () => {
    expect(() =>
      assertUpdateArchitecture(
        { files: [...intelOnly.files, { url: "Cocurdex-mac-arm64.dmg" }] },
        { platform: "darwin", arch: "arm64", translated: false },
      ),
    ).toThrow("missing Cocurdex-mac-arm64.zip");
  });

  it("accepts absolute native ZIP URLs", () => {
    expect(() =>
      assertUpdateArchitecture(
        { files: [{ url: "https://example.com/v1/Cocurdex-mac-arm64.zip" }] },
        { platform: "darwin", arch: "arm64", translated: false },
      ),
    ).not.toThrow();
  });

  it("keeps Intel Macs on Intel updates", () => {
    const host = { platform: "darwin", arch: "x64", translated: false };
    expect(() => assertUpdateArchitecture(both, host)).not.toThrow();
    expect(() =>
      assertUpdateArchitecture(
        { files: [{ url: "Cocurdex-mac-arm64.zip" }] },
        host,
      ),
    ).toThrow("missing Cocurdex-mac-x64.zip");
  });

  it("does not change non-Mac update support", () => {
    expect(() =>
      assertUpdateArchitecture(
        { files: [] },
        { platform: "win32", arch: "arm64", translated: true },
      ),
    ).not.toThrow();
  });
});
