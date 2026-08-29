/// <reference types="vite/client" />

import { loader } from "@monaco-editor/react";
import type { Highlighter } from "shiki";
import {
  EDITOR_SHIKI_THEMES,
  setTextmateThemeToMonacoTheme,
} from "./monaco-theme";
import { EDITOR_SHIKI_LANGUAGES } from "./monaco-utils";

const isTestEnvironment = import.meta.env.MODE === "test";

type MonacoEnvironmentShape = {
  getWorker(moduleId: string, label: string): Worker;
};

let monacoLoaderSetupPromise: Promise<void> | null = null;
let editorHighlighter: Highlighter | null = null;

export { isTestEnvironment };

// The Shiki highlighter that backs Monaco's syntax highlighting. Available once
// `ensureMonacoLoaderConfigured` resolves; used to re-derive themes when the app
// appearance changes (see monaco-theme `applyEditorTheme`).
export function getEditorHighlighter() {
  return editorHighlighter;
}

export function ensureMonacoLoaderConfigured() {
  if (monacoLoaderSetupPromise) {
    return monacoLoaderSetupPromise;
  }

  if (typeof window === "undefined" || isTestEnvironment) {
    monacoLoaderSetupPromise = Promise.resolve();
    return monacoLoaderSetupPromise;
  }

  monacoLoaderSetupPromise = setupMonaco().catch((error) => {
    monacoLoaderSetupPromise = null;
    throw error;
  });

  return monacoLoaderSetupPromise;
}

async function setupMonaco() {
  const [
    monaco,
    editorWorker,
    jsonWorker,
    cssWorker,
    htmlWorker,
    typescriptWorker,
    { createHighlighter },
    shikiMonaco,
  ] = await Promise.all([
    import("monaco-editor"),
    import("monaco-editor/editor/editor.worker.js?worker"),
    import("monaco-editor/language/json/json.worker.js?worker"),
    import("monaco-editor/language/css/css.worker.js?worker"),
    import("monaco-editor/language/html/html.worker.js?worker"),
    import("monaco-editor/language/typescript/ts.worker.js?worker"),
    import("shiki"),
    import("@shikijs/monaco"),
  ]);

  const { shikiToMonaco, textmateThemeToMonacoTheme } = shikiMonaco;
  setTextmateThemeToMonacoTheme(textmateThemeToMonacoTheme);

  (
    globalThis as typeof globalThis & {
      MonacoEnvironment?: MonacoEnvironmentShape;
    }
  ).MonacoEnvironment = {
    getWorker(_, label) {
      if (label === "json") {
        return new jsonWorker.default();
      }

      if (label === "css" || label === "scss" || label === "less") {
        return new cssWorker.default();
      }

      if (label === "html" || label === "handlebars" || label === "razor") {
        return new htmlWorker.default();
      }

      if (label === "typescript" || label === "javascript") {
        return new typescriptWorker.default();
      }

      return new editorWorker.default();
    },
  };

  // Drive highlighting with Shiki's TextMate grammars (same engine as VS Code)
  // instead of Monaco's built-in tokenizer, which lacks an Astro grammar and is
  // less accurate for embedded languages.
  const highlighter = await createHighlighter({
    themes: [EDITOR_SHIKI_THEMES.dark, EDITOR_SHIKI_THEMES.light],
    langs: EDITOR_SHIKI_LANGUAGES,
  });

  // Only registered language ids receive a Shiki tokens provider.
  for (const language of EDITOR_SHIKI_LANGUAGES) {
    monaco.languages.register({ id: language });
  }

  shikiToMonaco(highlighter, monaco);
  editorHighlighter = highlighter;

  loader.config({ monaco });
}
