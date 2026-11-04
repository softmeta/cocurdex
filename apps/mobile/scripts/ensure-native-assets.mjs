#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = path.resolve(MOBILE_ROOT, "..", "..");
const ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const markdownRoot = path.dirname(
  createRequire(path.join(MOBILE_ROOT, "package.json")).resolve(
    "react-native-enriched-markdown/package.json",
  ),
);
const grammarStamp = path.join(
  markdownRoot,
  "cpp",
  "highlight",
  "vendor",
  "grammars",
  ".stamp",
);

function vendorAssets() {
  return spawnSync(
    process.execPath,
    [path.join(markdownRoot, "postinstall.mjs")],
    {
      cwd: markdownRoot,
      env: { ...process.env, INIT_CWD: REPO_ROOT },
      stdio: "inherit",
    },
  );
}

for (let attempt = 1; !existsSync(grammarStamp); attempt += 1) {
  if (attempt > ATTEMPTS) {
    console.error(
      `react-native-enriched-markdown grammars are missing after ${ATTEMPTS} downloads: ${grammarStamp}`,
    );
    process.exit(1);
  }
  if (attempt > 1) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  console.log(
    `Downloading react-native-enriched-markdown grammars (attempt ${attempt} of ${ATTEMPTS})`,
  );
  vendorAssets();
}
