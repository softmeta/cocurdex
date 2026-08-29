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
  "cocurdex-ship",
  "cocurdex-spec",
  "cocurdex-ticket",
  "cocurdex-todo",
] as const;

export type ProductSkillName = (typeof PRODUCT_SKILL_NAMES)[number];

export const MANAGED_MARKER_FILENAME = ".cocurdex-skills.json";

/** Keep in sync with packages/product-skills/package.json version. */
export const PRODUCT_SKILLS_PACK_VERSION = "0.1.0";

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

export function getProductSkillsPackVersion(): string {
  return PRODUCT_SKILLS_PACK_VERSION;
}
