import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveElectronEntryDir(importMetaUrl: string): string {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function resolveElectronEntryPath(
  importMetaUrl: string,
  relativePath: string,
): string {
  return path.join(resolveElectronEntryDir(importMetaUrl), relativePath);
}
