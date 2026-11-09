#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEME_FILE = resolve(
  REPO_ROOT,
  "apps/desktop/src/styles/theme-preset.css",
);

const ALLOW_DARK_ONLY = new Set([
  "--editor-selection-bubble-border",
  "--editor-selection-bubble-bg",
  "--editor-selection-bubble-fg",
  "--editor-selection-bubble-kbd",
  "--editor-file-icon-active",
]);
const ALLOW_LIGHT_ONLY = new Set();
const DARK_SELECTOR = '[data-theme="dark"]';

function parseBlocks(source) {
  const blocks = [];
  const blockPattern = /(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/g;
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
  const dark = blocks.find((b) => b.selector === DARK_SELECTOR);

  if (!dark || !light) {
    console.error(`✖ Could not locate both :root and ${DARK_SELECTOR} blocks.`);
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
      `\n✖ ${onlyInDark.length} variable(s) defined in ${DARK_SELECTOR} but missing from :root:`,
    );
    for (const name of onlyInDark) console.error(`    ${name}`);
  }
  if (onlyInLight.length > 0) {
    console.error(
      `\n✖ ${onlyInLight.length} variable(s) defined in :root but missing from ${DARK_SELECTOR}:`,
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
