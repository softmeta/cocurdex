import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const OSS_LICENSES_FILE_VERSION = 1;
export const MAX_LICENSE_TEXT_CHARS = 200_000;

export const FD_MIT_LICENSE = `The MIT License (MIT)

Copyright (c) 2017 David Peter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const EXACT_EXCLUDES = new Set([
  "@cocurdex/desktop",
  "@tailwindcss/vite",
  "babel-plugin-react-compiler",
  "electron-builder",
  "electron-vite",
  "i18next-cli",
  "jsdom",
  "shadcn",
  "typescript",
  "vite",
  "vite-plugin-static-copy",
  "vitest",
]);

const LICENSE_FILE_RE = /^(license|licence|copying|notice)(\.(md|txt|rst))?$/i;

const PREFERRED_LICENSE_FILES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "COPYING",
  "NOTICE",
];

const KIND_ORDER = {
  app: 0,
  native: 1,
  package: 2,
};

export function parsePnpmLicensesJson(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("pnpm licenses list did not return JSON");
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

export function isExcludedPackage(name) {
  if (typeof name !== "string" || name.length === 0) {
    return true;
  }
  if (name.startsWith("@cocurdex/")) {
    return true;
  }
  if (name.startsWith("@types/")) {
    return true;
  }
  if (name.startsWith("@testing-library/")) {
    return true;
  }
  if (name.startsWith("@vitest/")) {
    return true;
  }
  if (name.startsWith("@vitejs/")) {
    return true;
  }
  if (name.startsWith("app-builder-")) {
    return true;
  }
  if (name.startsWith("@electron/")) {
    return true;
  }
  return EXACT_EXCLUDES.has(name);
}

export function flattenPnpmLicenses(grouped) {
  if (!grouped || typeof grouped !== "object") {
    return [];
  }
  const items = [];
  for (const [groupLicense, packages] of Object.entries(grouped)) {
    if (!Array.isArray(packages)) {
      continue;
    }
    for (const pkg of packages) {
      if (!pkg || typeof pkg !== "object" || typeof pkg.name !== "string") {
        continue;
      }
      const versions = Array.isArray(pkg.versions) ? pkg.versions : [];
      const paths = Array.isArray(pkg.paths) ? pkg.paths : [];
      const count = Math.max(versions.length, 1);
      for (let index = 0; index < count; index += 1) {
        const version =
          typeof versions[index] === "string" ? versions[index] : null;
        let packagePath = null;
        if (typeof paths[index] === "string") {
          packagePath = paths[index];
        } else if (typeof paths[0] === "string") {
          packagePath = paths[0];
        }
        const license =
          typeof pkg.license === "string" ? pkg.license : groupLicense;
        const homepage = typeof pkg.homepage === "string" ? pkg.homepage : null;
        items.push({
          homepage,
          license,
          name: pkg.name,
          packagePath,
          version,
        });
      }
    }
  }
  return items;
}

export function licenseFileNameFromDirents(names) {
  const files = names.filter((name) => LICENSE_FILE_RE.test(name));
  if (files.length === 0) {
    return null;
  }
  for (const preferred of PREFERRED_LICENSE_FILES) {
    const hit = files.find(
      (name) => name.toLowerCase() === preferred.toLowerCase(),
    );
    if (hit) {
      return hit;
    }
  }
  return files[0] ?? null;
}

export function textIdFor(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function makePackageId(name, version) {
  if (version) {
    return `${name}@${version}`;
  }
  return name;
}

export function uniqueId(id, seen) {
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  let suffix = 2;
  let next = `${id}#${suffix}`;
  while (seen.has(next)) {
    suffix += 1;
    next = `${id}#${suffix}`;
  }
  seen.add(next);
  return next;
}

export function sortOssLicenseEntries(entries) {
  return [...entries].sort((left, right) => {
    const kind = (KIND_ORDER[left.kind] ?? 9) - (KIND_ORDER[right.kind] ?? 9);
    if (kind !== 0) {
      return kind;
    }
    const name = left.name.localeCompare(right.name);
    if (name !== 0) {
      return name;
    }
    return (left.version ?? "").localeCompare(right.version ?? "");
  });
}

export function collectUniqueTexts(items) {
  const texts = {};
  const entries = [];
  for (const item of items) {
    const text =
      typeof item.text === "string" && item.text.trim().length > 0
        ? item.text.trim()
        : null;
    let textId = null;
    if (text) {
      textId = textIdFor(text);
      texts[textId] = text;
    }
    entries.push({
      homepage: item.homepage,
      id: item.id,
      kind: item.kind,
      license: item.license,
      name: item.name,
      textId,
      version: item.version,
    });
  }
  return {
    entries: sortOssLicenseEntries(entries),
    texts,
  };
}

export async function readLicenseText(packagePath) {
  if (!packagePath) {
    return null;
  }
  let names;
  try {
    names = await readdir(packagePath);
  } catch {
    return null;
  }
  const fileName = licenseFileNameFromDirents(names);
  if (!fileName) {
    return null;
  }
  try {
    const text = await readFile(path.join(packagePath, fileName), "utf8");
    const trimmed = text.slice(0, MAX_LICENSE_TEXT_CHARS).trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
