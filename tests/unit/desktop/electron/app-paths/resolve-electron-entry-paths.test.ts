import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveElectronEntryDir,
  resolveElectronEntryPath,
} from "@desktop/electron/app-paths/resolve-electron-entry-paths";
import { describe, expect, it } from "vitest";

describe("resolveElectronEntryDir", () => {
  it("derives the current directory from an ESM import.meta.url", () => {
    const entryPath = path.resolve("Users/x/app/apps/desktop/out/main/main.js");
    const entryUrl = pathToFileURL(entryPath).href;

    expect(resolveElectronEntryDir(entryUrl)).toBe(path.dirname(entryPath));
  });
});

describe("resolveElectronEntryPath", () => {
  it("resolves preload and renderer paths without CommonJS __dirname", () => {
    const entryPath = path.resolve("Users/x/app/apps/desktop/out/main/main.js");
    const entryDir = path.dirname(entryPath);
    const entryUrl = pathToFileURL(entryPath).href;

    expect(resolveElectronEntryPath(entryUrl, "../preload/preload.cjs")).toBe(
      path.join(entryDir, "../preload/preload.cjs"),
    );
    expect(resolveElectronEntryPath(entryUrl, "../renderer/index.html")).toBe(
      path.join(entryDir, "../renderer/index.html"),
    );
  });
});
