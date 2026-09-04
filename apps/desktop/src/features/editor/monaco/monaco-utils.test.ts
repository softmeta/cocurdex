import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_SHIKI_LANGUAGES,
  getEditorLanguage,
  revealPreviewLine,
} from "./monaco-utils";

function createEditorStub(lineCount: number) {
  const revealLineInCenter = vi.fn();
  const editor = {
    getModel: () => (lineCount > 0 ? { getLineCount: () => lineCount } : null),
    revealLineInCenter,
  } as unknown as MonacoEditorNamespace.IStandaloneCodeEditor;
  return { editor, revealLineInCenter };
}

describe("revealPreviewLine", () => {
  it("reveals the requested line centered", () => {
    const { editor, revealLineInCenter } = createEditorStub(5000);
    expect(revealPreviewLine(editor, 3081)).toBe(3081);
    expect(revealLineInCenter).toHaveBeenCalledWith(3081);
  });

  it("clamps a line beyond the file to the last line", () => {
    const { editor, revealLineInCenter } = createEditorStub(120);
    expect(revealPreviewLine(editor, 3081)).toBe(120);
    expect(revealLineInCenter).toHaveBeenCalledWith(120);
  });

  it("does nothing without a start line or model", () => {
    const withModel = createEditorStub(100);
    expect(revealPreviewLine(withModel.editor, null)).toBeNull();
    expect(withModel.revealLineInCenter).not.toHaveBeenCalled();

    const noModel = createEditorStub(0);
    expect(revealPreviewLine(noModel.editor, 10)).toBeNull();
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
