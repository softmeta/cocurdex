import type { LanguageRegistration } from "shiki/core";

type LanguageModule = { default: LanguageRegistration[] };
type LanguageLoader = () => Promise<LanguageModule>;

const LOADERS: Record<string, LanguageLoader> = {
  c: () => import("shiki/langs/c.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  less: () => import("shiki/langs/less.mjs"),
  lua: () => import("shiki/langs/lua.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  proto: () => import("shiki/langs/proto.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  bash: "shellscript",
  c: "c",
  cc: "c",
  cjs: "javascript",
  cpp: "c",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  dart: "dart",
  diff: "diff",
  go: "go",
  h: "c",
  hpp: "c",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "tsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  lua: "lua",
  markdown: "markdown",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  patch: "diff",
  php: "php",
  plist: "xml",
  proto: "proto",
  py: "python",
  rs: "rust",
  scss: "scss",
  sh: "shellscript",
  sql: "sql",
  svelte: "svelte",
  svg: "xml",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shellscript",
};

const FILENAME_LANGUAGES: Record<string, string> = {
  ".bashrc": "shellscript",
  ".zshrc": "shellscript",
  dockerfile: "dockerfile",
  "tsconfig.json": "jsonc",
};

export function sourceLanguage(fileName: string): string | null {
  const name = fileName.toLowerCase();
  const named = FILENAME_LANGUAGES[name];
  if (named) return named;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return EXTENSION_LANGUAGES[name.slice(dot + 1)] ?? null;
}

const FENCE_ALIASES: Record<string, string> = {
  docker: "dockerfile",
  golang: "go",
  shell: "shellscript",
};

export function codeFenceLanguage(fence: string): string | null {
  const name = fence.trim().toLowerCase();
  if (name in LOADERS) return name;
  return EXTENSION_LANGUAGES[name] ?? FENCE_ALIASES[name] ?? null;
}

export function loadSourceLanguage(language: string) {
  return LOADERS[language]?.() ?? null;
}

export function isMarkdownFile(fileName: string) {
  return sourceLanguage(fileName) === "markdown";
}
