import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(desktopDir, "package.json"));
const manifestPath = require.resolve("electron-vite/package.json");
const manifest = require(manifestPath);
const bin =
  typeof manifest.bin === "string"
    ? manifest.bin
    : manifest.bin["electron-vite"];

const child = spawn(
  process.execPath,
  [path.join(path.dirname(manifestPath), bin), "dev"],
  {
    cwd: desktopDir,
    env: {
      ...process.env,
      COCURDEX_REMOTE_DEBUGGING_PORT:
        process.env.COCURDEX_REMOTE_DEBUGGING_PORT ?? "9222",
    },
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
