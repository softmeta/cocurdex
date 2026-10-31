#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/index.ts",
);
const child = spawn(
  process.execPath,
  ["--import", "tsx", cliPath, ...process.argv.slice(2)],
  {
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
