import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatHex, formatHex8, parse, toGamut } from "culori";

const require = createRequire(import.meta.url);
const SOURCES = [
  "../../desktop/src/styles/theme-preset.css",
  "../../desktop/src/styles/theme-tokens.css",
].map((source) => require.resolve(source));
const OUTPUT = fileURLToPath(
  new URL("../src/theme/colors.generated.json", import.meta.url),
);
const SYNTAX_OUTPUT = fileURLToPath(
  new URL("../src/theme/syntax-colors.generated.json", import.meta.url),
);
const desktopRequire = createRequire(
  require.resolve("../../desktop/package.json"),
);
const SYNTAX_THEMES = {
  light: "shiki/themes/github-light-default.mjs",
  dark: "shiki/themes/github-dark-default.mjs",
};
const SYNTAX_SCOPES = {
  keyword: "keyword",
  string: "string",
  number: "constant.numeric",
  constant: "constant.language",
  comment: "comment",
  function: "entity.name.function",
  type: "entity.name.type",
  property: "support.type.property-name",
  tag: "entity.name.tag",
  attribute: "entity.other.attribute-name",
};
const SCOPES = { light: ":root", dark: '[data-theme="dark"]' };
const toSrgb = toGamut("rgb", "oklch");

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function readBlocks(css, selector) {
  const blocks = [];
  let index = css.indexOf(`${selector} {`);
  while (index !== -1) {
    const open = css.indexOf("{", index);
    let depth = 0;
    let close = open;
    for (; close < css.length; close += 1) {
      if (css[close] === "{") depth += 1;
      if (css[close] === "}") depth -= 1;
      if (depth === 0) break;
    }
    const before = css.slice(0, index).trimEnd();
    if (before === "" || before.endsWith("}")) {
      blocks.push(css.slice(open + 1, close));
    }
    index = css.indexOf(`${selector} {`, close);
  }
  return blocks;
}

function readDeclarations(block) {
  const declarations = new Map();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(match[1], match[2].replace(/\s+/g, " ").trim());
  }
  return declarations;
}

function splitArguments(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")") depth -= 1;
    if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function functionBody(value, name) {
  const prefix = `${name}(`;
  if (!value.startsWith(prefix) || !value.endsWith(")")) return null;
  return value.slice(prefix.length, -1);
}

function readMixStop(part, resolve) {
  const match = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part);
  const color = resolve(match ? match[1] : part);
  return color
    ? { color, weight: match ? Number(match[2]) / 100 : null }
    : null;
}

function mixSrgb(first, second) {
  const firstWeight =
    first.weight ?? (second.weight === null ? 0.5 : 1 - second.weight);
  const secondWeight = second.weight ?? 1 - firstWeight;
  const total = firstWeight + secondWeight;
  if (total === 0) return null;
  const p = firstWeight / total;
  const q = secondWeight / total;
  const a = first.color.alpha ?? 1;
  const b = second.color.alpha ?? 1;
  const alpha = a * p + b * q;
  const channel = (key) =>
    alpha === 0
      ? 0
      : (first.color[key] * a * p + second.color[key] * b * q) / alpha;
  return {
    mode: "rgb",
    r: channel("r"),
    g: channel("g"),
    b: channel("b"),
    alpha: alpha * Math.min(total, 1),
  };
}

function createResolver(declarations) {
  const cache = new Map();
  const resolve = (value) => {
    const variable = functionBody(value, "var");
    if (variable !== null) {
      const [name, fallback] = splitArguments(variable);
      if (declarations.has(name)) return resolveName(name);
      return fallback ? resolve(fallback) : null;
    }
    const mix = functionBody(value, "color-mix");
    if (mix !== null) {
      const [space, firstPart, secondPart] = splitArguments(mix);
      if (space !== "in srgb" || !firstPart || !secondPart) return null;
      const first = readMixStop(firstPart, resolve);
      const second = readMixStop(secondPart, resolve);
      return first && second ? mixSrgb(first, second) : null;
    }
    const parsed = parse(value);
    return parsed ? toSrgb(parsed) : null;
  };
  const resolveName = (name) => {
    if (!cache.has(name)) {
      cache.set(name, null);
      cache.set(name, resolve(declarations.get(name)));
    }
    return cache.get(name);
  };
  return resolveName;
}

function camelCase(name) {
  return name
    .slice(2)
    .replace(/-([a-z0-9])/g, (_match, letter) => letter.toUpperCase());
}

function formatColor(color) {
  return (color.alpha ?? 1) >= 1 ? formatHex(color) : formatHex8(color);
}

function themeColors(css, selectors) {
  const declarations = new Map();
  for (const selector of selectors) {
    for (const block of readBlocks(css, selector)) {
      for (const [name, value] of readDeclarations(block)) {
        declarations.set(name, value);
      }
    }
  }
  const resolveName = createResolver(declarations);
  const colors = {};
  for (const name of [...declarations.keys()].sort()) {
    const color = resolveName(name);
    if (color) colors[camelCase(name)] = formatColor(color);
  }
  return colors;
}

function selectorDepth(selector, scope) {
  if (selector.includes(" ")) return -1;
  return scope === selector || scope.startsWith(`${selector}.`)
    ? selector.split(".").length
    : -1;
}

function scopeColor(tokenColors, scope) {
  let best = { depth: 0, color: null };
  for (const { scope: selectors, settings } of tokenColors) {
    if (!settings?.foreground || !selectors) continue;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      const depth = selectorDepth(selector.trim(), scope);
      if (depth >= best.depth && depth > 0) {
        best = { depth, color: settings.foreground.toLowerCase() };
      }
    }
  }
  return best.color;
}

async function syntaxColors(themeModule) {
  const url = pathToFileURL(desktopRequire.resolve(themeModule));
  const { tokenColors } = (await import(url.href)).default;
  const colors = {};
  for (const [token, scope] of Object.entries(SYNTAX_SCOPES)) {
    const color = scopeColor(tokenColors, scope);
    if (color) colors[token] = color;
  }
  return colors;
}

function writeOrCheck(file, content, label) {
  if (!process.argv.includes("--check")) {
    writeFileSync(file, content, "utf8");
    return true;
  }
  if (readFileSync(file, "utf8") === content) return true;
  process.stderr.write(
    `apps/mobile/src/theme/${label} is stale; run pnpm --filter @cocurdex/mobile generate:theme-colors\n`,
  );
  return false;
}

const css = SOURCES.map((source) =>
  stripComments(readFileSync(source, "utf8")),
).join("\n");
const output = `${JSON.stringify(
  {
    light: themeColors(css, [SCOPES.light]),
    dark: themeColors(css, [SCOPES.light, SCOPES.dark]),
  },
  null,
  2,
)}\n`;

const syntaxOutput = `${JSON.stringify(
  {
    light: await syntaxColors(SYNTAX_THEMES.light),
    dark: await syntaxColors(SYNTAX_THEMES.dark),
  },
  null,
  2,
)}\n`;

const fresh = [
  writeOrCheck(OUTPUT, output, "colors.generated.json"),
  writeOrCheck(SYNTAX_OUTPUT, syntaxOutput, "syntax-colors.generated.json"),
];
if (fresh.includes(false)) process.exit(1);
