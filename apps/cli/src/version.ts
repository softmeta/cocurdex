import { createRequire } from "node:module";

/**
 * Injected by apps/desktop/scripts/build-cli.mjs when bundling the packaged CLI.
 * Undefined in monorepo `tsx` / vitest runs.
 */
declare const __COCURDEX_CLI_VERSION__: string | undefined;

/**
 * CLI package version (`apps/cli/package.json`).
 * Packaged builds get the value inlined; dev reads package.json at runtime.
 */
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
  } catch {
    // ignore
  }

  return "0.0.0-dev";
}
