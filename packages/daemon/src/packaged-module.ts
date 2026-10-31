import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export async function loadPackagedModule<T>(
  packageName: string,
  importDevelopment: () => Promise<T>,
  resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath,
): Promise<T> {
  if (resourcesPath) {
    const packagePath = path.join(resourcesPath, "app.asar", "package.json");
    if (existsSync(packagePath)) {
      return createRequire(packagePath)(
        path.join(
          resourcesPath,
          "app.asar",
          "node_modules",
          ...packageName.split("/"),
        ),
      ) as T;
    }
  }
  return importDevelopment();
}

export function loadNativeKeyring(resourcesPath?: string) {
  return loadPackagedModule(
    "@napi-rs/keyring",
    () => import("@napi-rs/keyring"),
    resourcesPath,
  );
}

export function loadNodePty() {
  return loadPackagedModule("node-pty", () => import("node-pty"));
}

export function loadFontList() {
  return loadPackagedModule("font-list", () => import("font-list"));
}
