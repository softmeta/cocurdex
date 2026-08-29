import type { editor as MonacoEditorNamespace } from "monaco-editor";

export const MONACO_EDITOR_OPTIONS: MonacoEditorNamespace.IStandaloneEditorConstructionOptions =
  {
    automaticLayout: true,
    bracketPairColorization: { enabled: true },
    contextmenu: false,
    cursorBlinking: "solid",
    cursorStyle: "line",
    domReadOnly: true,
    fixedOverflowWidgets: true,
    fontFamily: "var(--font-mono)",
    fontLigatures: false,
    // fontSize comes from Appearance codeFontSize via monaco-editor.tsx
    // (getEditorTypography) — never a module-level fixed px.
    glyphMargin: false,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    overviewRulerBorder: false,
    overviewRulerLanes: 0,
    padding: { bottom: 16, top: 16 },
    readOnly: true,
    renderLineHighlight: "gutter",
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
      horizontal: "hidden",
      horizontalScrollbarSize: 6,
      useShadows: false,
      verticalScrollbarSize: 6,
    },
    selectionHighlight: false,
    stickyScroll: { enabled: false },
    smoothScrolling: true,
    wordWrap: "off",
  };
