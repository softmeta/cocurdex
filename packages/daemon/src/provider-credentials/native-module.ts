import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export async function loadNativeKeyring(
  resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath,
): Promise<typeof import("@napi-rs/keyring")> {
  if (resourcesPath) {
    const packagePath = path.join(resourcesPath, "app.asar", "package.json");
    if (existsSync(packagePath)) {
      return createRequire(packagePath)(
        path.join(
          resourcesPath,
          "app.asar",
          "node_modules",
          "@napi-rs",
          "keyring",
        ),
      );
    }
  }
  return import("@napi-rs/keyring");
}
