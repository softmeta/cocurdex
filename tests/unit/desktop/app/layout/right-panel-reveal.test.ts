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
import { sidebarTabAtom } from "@/app/layout/sidebar/sidebar-tab-store";
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
  it("keeps assistant and work selections independent", () => {
    const store = createStore();
    store.set(rightPanelResolvedActiveViewAtom, "git");
    store.set(sidebarTabAtom, "personal");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("overview");
    store.set(rightPanelResolvedActiveViewAtom, "notes");
    store.set(sidebarTabAtom, "workspaces");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("git");
    store.set(sidebarTabAtom, "personal");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");
  });

  it("refuses work-only surfaces in assistant context while allowing file reveals", () => {
    const store = createStore();
    store.set(sidebarTabAtom, "personal");
    store.set(rightPanelResolvedActiveViewAtom, "terminal");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("overview");
    store.set(rightPanelActiveViewAtom, "git");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("overview");
    store.set(openFileAtom, "/workspace/result.md");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");
  });

  it("keeps chat to its own surfaces, reveals opened files, and restores work", () => {
    const store = createStore();
    store.set(rightPanelResolvedActiveViewAtom, "editor");
    store.set(sidebarTabAtom, "chat");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");
    for (const view of ["terminal", "decks", "git"] as const) {
      store.set(rightPanelActiveViewAtom, view);
      expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("notes");
    }
    store.set(rightPanelActiveViewAtom, "memory");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("memory");
    store.set(openFileAtom, "/chat/attachment.md");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");
    store.set(sidebarTabAtom, "workspaces");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("editor");
    store.set(rightPanelResolvedActiveViewAtom, "git");
    store.set(sidebarTabAtom, "chat");
    store.set(sidebarTabAtom, "workspaces");
    expect(store.get(rightPanelResolvedActiveViewAtom)).toBe("git");
  });

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
