import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  rightPanelActiveViewAtom,
  rightPanelLastNonTerminalViewAtom,
  rightPanelResolvedActiveViewAtom,
  rightPanelViewTouchedAtom,
} from "@/app/layout/right-editor-panel-store";
import {
  bumpRightPanelRevealAtom,
  rightPanelHandledRevealClockAtom,
  rightPanelRevealIntentAtom,
} from "@/app/layout/right-panel-reveal";
import { openFileAtom } from "@/features/editor/editor-store";
import {
  closePdfAtom,
  openPdfReaderAtom,
  openPdfsAtom,
} from "@/features/pdf-reader/pdf-reader-store";

beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  });
});

describe("rightPanelResolvedActiveViewAtom reveal", () => {
  it("switches to pdf after opening a non-pdf file then a pdf (last open wins)", () => {
    const store = createStore();
    store.set(rightPanelActiveViewAtom, "editor");
    store.set(rightPanelViewTouchedAtom, true);

    store.set(openFileAtom, "/workspace/readme.md");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");

    store.set(openPdfReaderAtom, "/workspace/paper.pdf");
    expect(store.get(openPdfsAtom)).toEqual(["/workspace/paper.pdf"]);
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("pdf");
  });

  it("switches to editor after opening a pdf then a non-pdf file", () => {
    const store = createStore();
    store.set(rightPanelActiveViewAtom, "pdf");
    store.set(rightPanelViewTouchedAtom, true);

    store.set(openPdfReaderAtom, "/workspace/paper.pdf");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("pdf");

    store.set(openFileAtom, "/workspace/readme.md");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");
  });

  it("stops forcing the reveal view after the user picks a tab", () => {
    const store = createStore();

    store.set(openFileAtom, "/workspace/a.ts");
    store.set(openPdfReaderAtom, "/workspace/b.pdf");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("pdf");

    store.set(rightPanelResolvedActiveViewAtom, "git");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("git");
    expect(store.get(rightPanelActiveViewAtom)).toBe("git");

    const intent = store.get(rightPanelRevealIntentAtom);
    expect(intent).not.toBeNull();
    expect(store.get(rightPanelHandledRevealClockAtom)).toBe(intent?.clock);
  });

  it("re-reveals when opening again after a manual tab pick", () => {
    const store = createStore();

    store.set(openPdfReaderAtom, "/workspace/a.pdf");
    store.set(rightPanelResolvedActiveViewAtom, "notes");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");

    store.set(bumpRightPanelRevealAtom, "pdf");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("pdf");
  });

  it("leaves the pdf view after closing the last open pdf", () => {
    const store = createStore();
    store.set(rightPanelActiveViewAtom, "notes");
    store.set(rightPanelLastNonTerminalViewAtom, "notes");
    store.set(rightPanelViewTouchedAtom, true);

    store.set(openPdfReaderAtom, "/workspace/paper.pdf");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("pdf");

    store.set(closePdfAtom, "/workspace/paper.pdf");
    expect(store.get(openPdfsAtom)).toEqual([]);
    // Unhandled pdf reveal must not pin the empty "No PDF open" surface.
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");
  });

  it("falls back to editor when stored view is pdf but no docs remain", () => {
    const store = createStore();
    store.set(rightPanelActiveViewAtom, "pdf");
    store.set(rightPanelLastNonTerminalViewAtom, "git");
    store.set(rightPanelViewTouchedAtom, true);
    store.set(openPdfsAtom, []);

    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("git");
  });
});
