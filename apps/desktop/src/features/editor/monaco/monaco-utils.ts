import type { editor as MonacoEditorNamespace } from "monaco-editor";

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

// Maps file extensions to Shiki language ids. The values double as the language
// set we register with the Shiki highlighter, so anything listed here gets real
// TextMate-grade syntax highlighting in the editor (see monaco-loader).
const EXTENSION_TO_SHIKI_LANGUAGE: Record<string, string> = {
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
};

// Deduplicated Shiki language ids to load into the highlighter on startup.
export const EDITOR_SHIKI_LANGUAGES: string[] = [
  ...new Set(Object.values(EXTENSION_TO_SHIKI_LANGUAGE)),
];

export function getEditorLanguage(filePath: string | null) {
  if (!filePath) {
    return "plaintext";
  }

  const extension = filePath.split(".").pop()?.toLowerCase();

  if (!extension) {
    return "plaintext";
  }

  return EXTENSION_TO_SHIKI_LANGUAGE[extension] ?? "plaintext";
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

// Scroll the target line into the editor's center. Kept separate from decoration
// syncing because callers must defer this to a frame after @monaco-editor/react
// swaps/restores the model on a path change — revealing synchronously in the
// same commit gets overwritten by the library's restoreViewState. Returns the
// clamped line that was revealed, or null when there is nothing to reveal.
export function revealPreviewLine(
  editor: MonacoEditorNamespace.IStandaloneCodeEditor,
  startLine?: number | null,
): number | null {
  const model = editor.getModel();
  if (!model || !startLine) {
    return null;
  }

  const safeStartLine = Math.max(1, Math.min(startLine, model.getLineCount()));
  editor.revealLineInCenter(safeStartLine);
  return safeStartLine;
}
