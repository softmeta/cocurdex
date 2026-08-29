import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveElectronEntryDir,
  resolveElectronEntryPath,
} from "./resolve-electron-entry-paths";

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
