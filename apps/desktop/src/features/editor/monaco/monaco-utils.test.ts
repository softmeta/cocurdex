import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_SHIKI_LANGUAGES,
  getEditorLanguage,
  revealPreviewRange,
} from "./monaco-utils";

const LINE_HEIGHT = 20;

function createEditorStub(lineCount: number, viewportHeight = 1000) {
  const revealLineInCenter = vi.fn();
  const revealLinesInCenter = vi.fn();
  const editor = {
    getBottomForLineNumber: (lineNumber: number) => lineNumber * LINE_HEIGHT,
    getLayoutInfo: () => ({ height: viewportHeight }),
    getModel: () => (lineCount > 0 ? { getLineCount: () => lineCount } : null),
    getTopForLineNumber: (lineNumber: number) => (lineNumber - 1) * LINE_HEIGHT,
    revealLineInCenter,
    revealLinesInCenter,
  } as unknown as MonacoEditorNamespace.IStandaloneCodeEditor;
  return { editor, revealLineInCenter, revealLinesInCenter };
}

describe("revealPreviewRange", () => {
  it("reveals the requested line centered", () => {
    const { editor, revealLineInCenter } = createEditorStub(5000);
    expect(revealPreviewRange(editor, 3081)).toBe(3081);
    expect(revealLineInCenter).toHaveBeenCalledWith(3081);
  });

  it("clamps a line beyond the file to the last line", () => {
    const { editor, revealLineInCenter } = createEditorStub(120);
    expect(revealPreviewRange(editor, 3081)).toBe(120);
    expect(revealLineInCenter).toHaveBeenCalledWith(120);
  });

  it("reveals a line range as a whole", () => {
    const { editor, revealLineInCenter, revealLinesInCenter } =
      createEditorStub(5000);
    expect(revealPreviewRange(editor, 1544, 1572)).toBe(1544);
    expect(revealLinesInCenter).toHaveBeenCalledWith(1544, 1572);
    expect(revealLineInCenter).not.toHaveBeenCalled();
  });

  it("clamps a range end beyond the file to the last line", () => {
    const { editor, revealLinesInCenter } = createEditorStub(1560);
    expect(revealPreviewRange(editor, 1544, 1572)).toBe(1544);
    expect(revealLinesInCenter).toHaveBeenCalledWith(1544, 1560);
  });

  it("centers a single line when the range is empty or reversed", () => {
    const sameLine = createEditorStub(5000);
    expect(revealPreviewRange(sameLine.editor, 1544, 1544)).toBe(1544);
    expect(sameLine.revealLineInCenter).toHaveBeenCalledWith(1544);
    expect(sameLine.revealLinesInCenter).not.toHaveBeenCalled();

    const reversed = createEditorStub(5000);
    expect(revealPreviewRange(reversed.editor, 1544, 12)).toBe(1544);
    expect(reversed.revealLineInCenter).toHaveBeenCalledWith(1544);
    expect(reversed.revealLinesInCenter).not.toHaveBeenCalled();
  });

  it("reports an unlaid-out viewport as unrevealed", () => {
    // Opening the panel mounts Monaco before its container has a height;
    // Monaco floors that measurement, so the range is parked at the top edge
    // and the caller has to replay the reveal once the layout lands.
    const { editor, revealLinesInCenter } = createEditorStub(5000, 5);
    expect(revealPreviewRange(editor, 1544, 1572)).toBeNull();
    expect(revealLinesInCenter).toHaveBeenCalledWith(1544, 1572);
  });

  it("reports a range taller than the viewport as unrevealed", () => {
    const { editor } = createEditorStub(5000, 400);
    expect(revealPreviewRange(editor, 1544, 1572)).toBeNull();
  });

  it("reveals a range that exactly fills the viewport", () => {
    const { editor } = createEditorStub(5000, 29 * LINE_HEIGHT);
    expect(revealPreviewRange(editor, 1544, 1572)).toBe(1544);
  });

  it("does nothing without a start line or model", () => {
    const withModel = createEditorStub(100);
    expect(revealPreviewRange(withModel.editor, null)).toBeNull();
    expect(withModel.revealLineInCenter).not.toHaveBeenCalled();

    const noModel = createEditorStub(0);
    expect(revealPreviewRange(noModel.editor, 10)).toBeNull();
    expect(noModel.revealLineInCenter).not.toHaveBeenCalled();
  });
});

describe("getEditorLanguage", () => {
  it("uses the dedicated Astro grammar for .astro files", () => {
    expect(getEditorLanguage("/workspace/src/pages/index.astro")).toBe("astro");
  });

  it("maps known extensions to their Shiki language ids", () => {
    expect(getEditorLanguage("a.ts")).toBe("typescript");
    expect(getEditorLanguage("a.tsx")).toBe("tsx");
    expect(getEditorLanguage("a.mts")).toBe("typescript");
    expect(getEditorLanguage("a.cts")).toBe("typescript");
    expect(getEditorLanguage("a.js")).toBe("javascript");
    expect(getEditorLanguage("a.jsx")).toBe("jsx");
    expect(getEditorLanguage("a.mjs")).toBe("javascript");
    expect(getEditorLanguage("a.cjs")).toBe("javascript");
    expect(getEditorLanguage("a.sh")).toBe("bash");
    expect(getEditorLanguage("a.py")).toBe("python");
    expect(getEditorLanguage("a.md")).toBe("markdown");
    expect(getEditorLanguage("a.swift")).toBe("swift");
  });

  it("falls back to plaintext for unknown or missing files", () => {
    expect(getEditorLanguage("a.unknownext")).toBe("plaintext");
    expect(getEditorLanguage(null)).toBe("plaintext");
  });

  it("registers astro in the Shiki language set", () => {
    expect(EDITOR_SHIKI_LANGUAGES).toContain("astro");
  });

  it("registers swift in the Shiki language set", () => {
    expect(EDITOR_SHIKI_LANGUAGES).toContain("swift");
  });
});
