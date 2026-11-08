import { createRequire } from "node:module";

declare const __COCURDEX_CLI_VERSION__: string | undefined;

export function getCliVersion(): string {
  if (
    typeof __COCURDEX_CLI_VERSION__ === "string" &&
    __COCURDEX_CLI_VERSION__.length > 0
  ) {
    return __COCURDEX_CLI_VERSION__;
  }

  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    if (typeof pkg.version === "string" && pkg.version) {
      return pkg.version;
    }
  } catch {}

  return "0.0.0-dev";
}
