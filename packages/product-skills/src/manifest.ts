import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Product skill directories shipped with Cocurdex (namespaced cocurdex-*). */
export const PRODUCT_SKILL_NAMES = [
  "cocurdex-ask",
  "cocurdex-grill",
  "cocurdex-issue",
  "cocurdex-layout",
  "cocurdex-link",
  "cocurdex-note",
  "cocurdex-prd",
  "cocurdex-settings",
  "cocurdex-ship",
  "cocurdex-spec",
  "cocurdex-team",
  "cocurdex-ticket",
  "cocurdex-todo",
] as const;

export type ProductSkillName = (typeof PRODUCT_SKILL_NAMES)[number];

export const MANAGED_MARKER_FILENAME = ".cocurdex-skills.json";

export type SkillScope = "project" | "global";

export type ManagedSkillsMarker = {
  managedBy: "cocurdex";
  packVersion: string;
  skills: string[];
  scope: SkillScope;
  installedAt: string;
};

/** Directory containing each product skill folder next to this package. */
export function getDefaultSkillsSourceRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../skills");
}

async function listSkillFiles(
  sourceRoot: string,
  skillName: string,
): Promise<string[]> {
  try {
    const entries = await readdir(path.join(sourceRoot, skillName), {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path
          .relative(sourceRoot, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join("/"),
      );
  } catch {
    return [];
  }
}

export async function getProductSkillsPackVersion(
  sourceRoot = getDefaultSkillsSourceRoot(),
): Promise<string> {
  const hash = createHash("sha256");
  for (const skillName of PRODUCT_SKILL_NAMES) {
    const files = (await listSkillFiles(sourceRoot, skillName)).sort();
    for (const file of files) {
      hash.update(`${file}\0`);
      hash.update(await readFile(path.join(sourceRoot, file)));
      hash.update("\0");
    }
  }
  return hash.digest("hex").slice(0, 12);
}
