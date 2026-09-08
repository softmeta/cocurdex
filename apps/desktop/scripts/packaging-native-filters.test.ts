import { describe, expect, it } from "vitest";
import {
  createNativePackageExcludes,
  nativeIdMatchesTarget,
} from "./packaging-native-filters.mjs";

describe("nativeIdMatchesTarget", () => {
  it("keeps the matching darwin CPU package and drops universal", () => {
    expect(nativeIdMatchesTarget("darwin-x64", "darwin", "x64")).toBe(true);
    expect(nativeIdMatchesTarget("darwin-arm64", "darwin", "arm64")).toBe(true);
    expect(nativeIdMatchesTarget("darwin-x64", "darwin", "arm64")).toBe(false);
    expect(nativeIdMatchesTarget("darwin-universal", "darwin", "x64")).toBe(
      false,
    );
  });

  it("keeps linux glibc/musl variants for the target CPU only", () => {
    expect(nativeIdMatchesTarget("linux-x64-gnu", "linux", "x64")).toBe(true);
    expect(nativeIdMatchesTarget("linux-x64-musl", "linux", "x64")).toBe(true);
    expect(nativeIdMatchesTarget("linux-arm64-gnu", "linux", "x64")).toBe(
      false,
    );
    expect(nativeIdMatchesTarget("linux-arm-gnueabihf", "linux", "arm64")).toBe(
      false,
    );
    expect(nativeIdMatchesTarget("linux-arm64-gnu", "linux", "arm64")).toBe(
      true,
    );
  });

  it("does not treat linux-arm as linux-arm64", () => {
    expect(nativeIdMatchesTarget("linux-arm", "linux", "arm64")).toBe(false);
    expect(nativeIdMatchesTarget("linux-arm", "linux", "arm")).toBe(true);
    expect(nativeIdMatchesTarget("linux-arm", "linux", "armv7l")).toBe(true);
  });
});

describe("createNativePackageExcludes", () => {
  it("excludes the other darwin clipboard package when packing Intel", () => {
    const excludes = createNativePackageExcludes("darwin", "x64");
    expect(excludes).toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-arm64/**/*",
    );
    expect(excludes).toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-universal/**/*",
    );
    expect(excludes).not.toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-x64/**/*",
    );
  });

  it("excludes foreign OS and CPU natives for Apple Silicon", () => {
    const excludes = createNativePackageExcludes("darwin", "arm64");
    expect(excludes).toContain(
      "!**/node_modules/@vscode/ripgrep-darwin-x64/**/*",
    );
    expect(excludes).toContain(
      "!**/node_modules/@napi-rs/keyring-linux-x64-gnu/**/*",
    );
    expect(excludes).toContain(
      "!**/node_modules/node-pty/prebuilds/darwin-x64/**/*",
    );
    expect(excludes).not.toContain(
      "!**/node_modules/@vscode/ripgrep-darwin-arm64/**/*",
    );
    expect(excludes).not.toContain(
      "!**/node_modules/node-pty/prebuilds/darwin-arm64/**/*",
    );
  });

  it("keeps linux x64 glibc keyring while dropping arm64", () => {
    const excludes = createNativePackageExcludes("linux", "x64");
    expect(excludes).not.toContain(
      "!**/node_modules/@napi-rs/keyring-linux-x64-gnu/**/*",
    );
    expect(excludes).toContain(
      "!**/node_modules/@napi-rs/keyring-linux-arm64-gnu/**/*",
    );
  });
});
