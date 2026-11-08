import type { editor as MonacoEditorNamespace } from "monaco-editor";
import type { BundledLanguage } from "shiki";

export function getRelativePath(filePath: string, rootPath?: string) {
  if (!rootPath || !filePath.startsWith(rootPath)) {
    return filePath;
  }

  return filePath.slice(rootPath.length + 1);
}

export function getPreviewRangeLabel(
  startLine?: number | null,
  endLine?: number | null,
) {
  if (!startLine && !endLine) {
    return null;
  }

  if (startLine && endLine && startLine !== endLine) {
    return `L${startLine}-${endLine}`;
  }

  return `L${startLine ?? endLine}`;
}

const EXTENSION_TO_SHIKI_LANGUAGE: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  go: "go",
  py: "python",
  rs: "rust",
  java: "java",
  sql: "sql",
  astro: "astro",
  swift: "swift",
  toml: "toml",
  vue: "vue",
  svelte: "svelte",
  less: "less",
  c: "c",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  m: "objective-c",
  cs: "csharp",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  gradle: "groovy",
  rb: "ruby",
  php: "php",
  lua: "lua",
  dart: "dart",
  zig: "zig",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  r: "r",
  pl: "perl",
  zsh: "shellscript",
  fish: "fish",
  ps1: "powershell",
  bat: "bat",
  cmd: "bat",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  env: "dotenv",
  jsonc: "jsonc",
  json5: "json5",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  prisma: "prisma",
  tf: "terraform",
  hcl: "hcl",
  nix: "nix",
  cmake: "cmake",
  mk: "make",
  dockerfile: "docker",
  diff: "diff",
  patch: "diff",
  svg: "xml",
};

const FILENAME_TO_SHIKI_LANGUAGE: Record<string, BundledLanguage> = {
  dockerfile: "docker",
  containerfile: "docker",
  makefile: "make",
  gnumakefile: "make",
  "cmakelists.txt": "cmake",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  ".bashrc": "shellscript",
  ".zshrc": "shellscript",
  ".profile": "shellscript",
  ".env": "dotenv",
};

const FILENAME_PREFIX_TO_SHIKI_LANGUAGE: [string, BundledLanguage][] = [
  ["dockerfile.", "docker"],
  [".env.", "dotenv"],
];

export const EDITOR_SHIKI_LANGUAGES: BundledLanguage[] = [
  ...new Set([
    ...Object.values(EXTENSION_TO_SHIKI_LANGUAGE),
    ...Object.values(FILENAME_TO_SHIKI_LANGUAGE),
    ...FILENAME_PREFIX_TO_SHIKI_LANGUAGE.map(([, language]) => language),
  ]),
];

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function getFileNameLanguage(fileName: string) {
  const exact = FILENAME_TO_SHIKI_LANGUAGE[fileName];
  if (exact) {
    return exact;
  }
  return FILENAME_PREFIX_TO_SHIKI_LANGUAGE.find(([prefix]) =>
    fileName.startsWith(prefix),
  )?.[1];
}

export function getEditorLanguage(filePath: string | null) {
  if (!filePath) {
    return "plaintext";
  }

  const fileName = getFileName(filePath);
  const fileNameLanguage = getFileNameLanguage(fileName);
  if (fileNameLanguage) {
    return fileNameLanguage;
  }

  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) {
    return "plaintext";
  }

  return (
    EXTENSION_TO_SHIKI_LANGUAGE[fileName.slice(dotIndex + 1)] ?? "plaintext"
  );
}

export function syncPreviewRange(
  editor: MonacoEditorNamespace.IStandaloneCodeEditor,
  decorationCollection: MonacoEditorNamespace.IEditorDecorationsCollection,
  startLine?: number | null,
  endLine?: number | null,
) {
  const model = editor.getModel();

  if (!model || !startLine) {
    decorationCollection.set([]);
    return;
  }

  const safeStartLine = Math.max(1, Math.min(startLine, model.getLineCount()));
  const safeEndLine = Math.max(
    safeStartLine,
    Math.min(endLine ?? safeStartLine, model.getLineCount()),
  );

  decorationCollection.set([
    {
      range: {
        startColumn: 1,
        startLineNumber: safeStartLine,
        endColumn: model.getLineMaxColumn(safeEndLine),
        endLineNumber: safeEndLine,
      },
      options: {
        className: "agents-monaco-range-highlight",
        isWholeLine: true,
        linesDecorationsClassName: "agents-monaco-range-gutter",
        marginClassName: "agents-monaco-range-margin",
      },
    },
  ]);
}

export function revealPreviewRange(
  editor: MonacoEditorNamespace.IStandaloneCodeEditor,
  startLine?: number | null,
  endLine?: number | null,
): number | null {
  const model = editor.getModel();
  if (!model || !startLine) {
    return null;
  }

  const lineCount = model.getLineCount();
  const safeStartLine = Math.max(1, Math.min(startLine, lineCount));
  const safeEndLine = Math.max(
    safeStartLine,
    Math.min(endLine ?? safeStartLine, lineCount),
  );

  if (safeEndLine > safeStartLine) {
    editor.revealLinesInCenter(safeStartLine, safeEndLine);
  } else {
    editor.revealLineInCenter(safeStartLine);
  }

  const rangeHeight =
    editor.getBottomForLineNumber(safeEndLine) -
    editor.getTopForLineNumber(safeStartLine);
  return rangeHeight <= editor.getLayoutInfo().height ? safeStartLine : null;
}
