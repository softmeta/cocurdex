import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let installScript;
try {
  installScript = require.resolve("electron/install.js");
} catch {
  throw new Error(
    "electron is not installed. Run pnpm install from the repo root.",
  );
}

const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
