#!/usr/bin/env node
/*
 * Theme parity lint.
 *
 * The desktop app switches themes by mirroring the resolved theme to
 * `<html class="dark">`, backed by paired preset variable blocks in
 * apps/desktop/src/styles/theme-preset.css:
 *
 *   :root  — light theme
 *   .dark  — dark theme overrides
 *
 * Every variable defined in one block must be defined in the other so that
 * switching themes does not leave a variable resolving to the wrong color or
 * undefined. This script parses both blocks and reports variables that exist
 * in one but not the other.
 *
 * Run with `pnpm lint:theme-parity` from the repo root.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEME_FILE = resolve(
  REPO_ROOT,
  "apps/desktop/src/styles/theme-preset.css",
);

/*
 * A small allow-list for variables that are intentionally one-theme-only
 * (e.g. dark theme uses a token that the light theme doesn't need because the
 * light look-and-feel composes differently). Add a brief justification.
 */
const ALLOW_DARK_ONLY = new Set([
  // Dark-mode selection bubble has its own color treatment; light theme reuses
  // the regular bubble surface instead.
  "--editor-selection-bubble-border",
  "--editor-selection-bubble-bg",
  "--editor-selection-bubble-fg",
  "--editor-selection-bubble-kbd",
  // File-tree active icon color only meaningful in the dark gold-on-dark look.
  "--editor-file-icon-active",
]);
const ALLOW_LIGHT_ONLY = new Set();

function parseBlocks(source) {
  const blocks = [];
  // Match `:root` or `.dark` followed by `{ ... }`. CSS variable blocks are
  // flat (no nesting in this file), so a non-greedy match is sufficient.
  const blockPattern = /(:root|\.dark)\s*\{([^}]*)\}/g;
  for (
    let match = blockPattern.exec(source);
    match !== null;
    match = blockPattern.exec(source)
  ) {
    const selector = match[1];
    const body = match[2];
    const vars = new Map();
    const varPattern = /(--[a-zA-Z0-9_-]+)\s*:/g;
    for (
      let varMatch = varPattern.exec(body);
      varMatch !== null;
      varMatch = varPattern.exec(body)
    ) {
      vars.set(varMatch[1], true);
    }
    blocks.push({ selector, vars });
  }
  return blocks;
}

async function main() {
  const source = await readFile(THEME_FILE, "utf-8");
  const blocks = parseBlocks(source);

  const light = blocks.find((b) => b.selector === ":root");
  const dark = blocks.find((b) => b.selector === ".dark");

  if (!dark || !light) {
    console.error("✖ Could not locate both :root and .dark blocks.");
    process.exit(2);
  }

  const onlyInDark = [];
  const onlyInLight = [];
  for (const name of dark.vars.keys()) {
    if (!light.vars.has(name) && !ALLOW_DARK_ONLY.has(name))
      onlyInDark.push(name);
  }
  for (const name of light.vars.keys()) {
    if (!dark.vars.has(name) && !ALLOW_LIGHT_ONLY.has(name))
      onlyInLight.push(name);
  }

  if (onlyInDark.length === 0 && onlyInLight.length === 0) {
    console.log(
      `✔ theme parity clean (${dark.vars.size} dark / ${light.vars.size} light variables aligned)`,
    );
    return;
  }

  if (onlyInDark.length > 0) {
    console.error(
      `\n✖ ${onlyInDark.length} variable(s) defined in .dark but missing from :root:`,
    );
    for (const name of onlyInDark) console.error(`    ${name}`);
  }
  if (onlyInLight.length > 0) {
    console.error(
      `\n✖ ${onlyInLight.length} variable(s) defined in :root but missing from .dark:`,
    );
    for (const name of onlyInLight) console.error(`    ${name}`);
  }
  console.error(
    `\nDefine the missing variables in the other block, or allow-list them in scripts/lint-theme-parity.mjs with a justification.`,
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
