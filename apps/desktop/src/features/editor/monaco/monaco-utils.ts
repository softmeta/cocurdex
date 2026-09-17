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

// Maps file extensions to Shiki language ids. The values double as the language
// set we register with the Shiki highlighter, so anything listed here gets real
// TextMate-grade syntax highlighting in the editor (see monaco-loader).
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
};

export const EDITOR_SHIKI_LANGUAGES: BundledLanguage[] = [
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

// Scroll the target line, or range, into the editor's center. Kept separate
// from decoration syncing because callers must defer this to a frame after
// @monaco-editor/react swaps/restores the model on a path change — revealing
// synchronously in the same commit gets overwritten by the library's
// restoreViewState.
//
// Returns the clamped first line once the whole range is on screen, or null
// when it is not — either there is nothing to reveal, or the viewport cannot
// hold the range yet. Opening the editor mounts Monaco while the right panel is
// still collapsing to its final height; Monaco floors that measurement, its
// reveal then takes the "range larger than viewport" branch and parks the
// citation against the top edge. Callers keep such a request pending and replay
// it on the next layout change instead of leaving it stuck at the top.
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

  // A range reveals as a whole (Monaco only scrolls when it does not fit), so a
  // multi-line citation stays visible instead of centering on its first line.
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
