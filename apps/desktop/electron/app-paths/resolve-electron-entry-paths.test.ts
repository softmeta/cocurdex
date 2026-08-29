import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveElectronEntryDir,
  resolveElectronEntryPath,
} from "./resolve-electron-entry-paths";

describe("resolveElectronEntryDir", () => {
  it("derives the current directory from an ESM import.meta.url", () => {
    const entryUrl = pathToFileURL(
      "/Users/x/app/apps/desktop/out/main/main.js",
    ).href;

    expect(resolveElectronEntryDir(entryUrl)).toBe(
      "/Users/x/app/apps/desktop/out/main",
    );
  });
});

describe("resolveElectronEntryPath", () => {
  it("resolves preload and renderer paths without CommonJS __dirname", () => {
    const entryUrl = pathToFileURL(
      "/Users/x/app/apps/desktop/out/main/main.js",
    ).href;

    expect(resolveElectronEntryPath(entryUrl, "../preload/preload.cjs")).toBe(
      path.join("/Users/x/app/apps/desktop/out/main", "../preload/preload.cjs"),
    );
    expect(resolveElectronEntryPath(entryUrl, "../renderer/index.html")).toBe(
      path.join("/Users/x/app/apps/desktop/out/main", "../renderer/index.html"),
    );
  });
});
