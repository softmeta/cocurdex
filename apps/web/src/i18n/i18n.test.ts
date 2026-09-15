import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { localizedPath, unlocalizedPath } from "./locales";
import { dict as en } from "./marketing/en";
import { dict as zhCn } from "./marketing/zh-cn";

const here = path.dirname(fileURLToPath(import.meta.url));

function deepKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return [`${prefix}[]`];
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => deepKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function listMdxFiles(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...listMdxFiles(full).map((child) => `${name}/${child}`));
    } else if (name.endsWith(".mdx") || name.endsWith(".md")) {
      entries.push(name);
    }
  }
  return entries.sort();
}

describe("marketing dictionaries", () => {
  it("zh-cn has exactly the same keys as en", () => {
    expect(deepKeys(zhCn).sort()).toEqual(deepKeys(en).sort());
  });
});

describe("docs content", () => {
  it("zh-cn docs mirror the en docs tree", () => {
    const enDocs = listMdxFiles(path.join(here, "../content/docs/docs"));
    const zhDocs = listMdxFiles(path.join(here, "../content/docs/zh-cn/docs"));
    expect(zhDocs).toEqual(enDocs);
  });
});

describe("localizedPath", () => {
  it("keeps en paths unprefixed and prefixes zh-cn", () => {
    expect(localizedPath("en", "/docs/")).toBe("/docs/");
    expect(localizedPath("zh-cn", "/docs/")).toBe("/zh-cn/docs/");
    expect(localizedPath("zh-cn", "/")).toBe("/zh-cn/");
  });

  it("unlocalizedPath strips a leading zh-cn prefix", () => {
    expect(unlocalizedPath("/zh-cn/download/")).toBe("/download/");
    expect(unlocalizedPath("/zh-cn")).toBe("/");
    expect(unlocalizedPath("/download/")).toBe("/download/");
  });
});
