#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { selectLintInput } from "./lint-i18n-selection.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(DESKTOP_ROOT, "../..");
const LINT_TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const forceFull = args.includes("--all");
const explicitFiles = args.filter((arg) => !arg.startsWith("--"));
const startedAt = performance.now();

function formatDuration(start, end = performance.now()) {
  const ms = end - start;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function createConfig(input) {
  const tempDir = await mkdtemp(join(tmpdir(), "cocurdex-i18n-lint-"));
  const configPath = join(tempDir, "i18next.config.mjs");
  const config = `export default {
  locales: ["en-US", "zh-CN"],
  extract: {
    defaultNS: "common",
    defaultValue: "",
    indentation: 2,
    input: ${JSON.stringify(input, null, 4)},
    keySeparator: ".",
    nsSeparator: ":",
    output: "src/locales/{{language}}/{{namespace}}.json",
    outputFormat: "json",
    primaryLanguage: "en-US",
    removeUnusedKeys: false,
    sort: true,
    transComponents: ["Trans"],
    useTranslationNames: ["useTranslation"],
  },
  lint: {
    checkInterpolationParams: true,
    ignore: ["src/test/**"],
    ignoredAttributes: ["className", "data-testid"],
    ignoredTags: ["code", "pre"],
  },
  types: {
    enableSelector: false,
    indentation: 2,
    input: ["src/locales/en-US/*.json"],
    output: "src/i18n/generated.d.ts",
    resourcesFile: "src/i18n/resources.generated.d.ts",
  },
};
`;
  await writeFile(configPath, config, "utf-8");
  return { configPath, tempDir };
}

function runI18nextLint(configPath) {
  const cliPath = fileURLToPath(
    new URL("../node_modules/i18next-cli/dist/esm/cli.js", import.meta.url),
  );
  return new Promise((resolvePromise) => {
    let settled = false;
    const child = spawn(
      process.execPath,
      [cliPath, "--config", configPath, "lint"],
      {
        cwd: DESKTOP_ROOT,
        stdio: ["ignore", "inherit", "inherit"],
      },
    );

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      console.error(
        `[i18n-lint] i18next-cli timed out after ${Math.round(
          LINT_TIMEOUT_MS / 1000,
        )}s`,
      );
      resolvePromise(1);
    }, LINT_TIMEOUT_MS);

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolvePromise(code ?? 1);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      console.error(error);
      resolvePromise(1);
    });
  });
}

const selected = await selectLintInput({
  desktopRoot: DESKTOP_ROOT,
  files: explicitFiles,
  forceFull: forceFull || explicitFiles.length === 0,
  repoRoot: REPO_ROOT,
});

if (selected.input.length === 0) {
  console.log(
    `[i18n-lint] skipped: ${selected.reason} (${formatDuration(startedAt)})`,
  );
  process.exit(0);
}

const lintStartedAt = performance.now();
console.log(`[i18n-lint] ${selected.reason}; input=${selected.input.length}`);

let tempDir;
try {
  const config = await createConfig(selected.input);
  tempDir = config.tempDir;
  const exitCode = await runI18nextLint(config.configPath);
  const lintDuration = formatDuration(lintStartedAt);
  const totalDuration = formatDuration(startedAt);
  console.log(
    `[i18n-lint] finished in ${totalDuration} (i18next-cli ${lintDuration})`,
  );
  process.exit(exitCode);
} finally {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true });
  }
}
