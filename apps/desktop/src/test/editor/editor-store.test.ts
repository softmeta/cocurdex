import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  activeFileAtom,
  attachEditorSelectionToChatAtom,
  chatComposerAttachmentAtom,
  closeFileAtom,
  editorDraftViewsByWorkspaceAtom,
  editorPanelOpenAtom,
  editorRevealNonceAtom,
  openFileAtom,
  openFilePreviewAtom,
  openFilesAtom,
  previewLocationsByFileAtom,
  restoreEditorDraftForWorkspaceAtom,
  restoreEditorViewForSessionAtom,
  saveEditorDraftForWorkspaceAtom,
  saveEditorViewSnapshotAtom,
  setEditorSelectionAttachmentAtom,
} from "@/features/editor";

describe("editor store", () => {
  it("tracks open files and the active file", () => {
    const store = createStore();

    store.set(openFileAtom, "src/main.tsx");

    expect(store.get(activeFileAtom)).toBe("src/main.tsx");
  });

  it("opens a file preview with a selected line range", () => {
    const store = createStore();

    store.set(openFilePreviewAtom, {
      filePath: "src/layout.tsx",
      startLine: 1,
      endLine: 51,
      title: "Read Layout.tsx L1-51",
    });

    expect(store.get(openFilesAtom)).toEqual(["src/layout.tsx"]);
    expect(store.get(activeFileAtom)).toBe("src/layout.tsx");
    expect(store.get(previewLocationsByFileAtom)["src/layout.tsx"]).toEqual({
      filePath: "src/layout.tsx",
      startLine: 1,
      endLine: 51,
      title: "Read Layout.tsx L1-51",
    });
  });

  it("bumps the reveal nonce when a file is opened so the panel can reveal it", () => {
    const store = createStore();
    const initial = store.get(editorRevealNonceAtom);

    store.set(openFilePreviewAtom, { filePath: "src/app.ts", startLine: 5 });
    expect(store.get(editorRevealNonceAtom)).toBe(initial + 1);

    store.set(openFileAtom, "src/other.ts");
    expect(store.get(editorRevealNonceAtom)).toBe(initial + 2);
  });

  it("opens the editor panel when a file is opened", () => {
    const store = createStore();

    expect(store.get(editorPanelOpenAtom)).toBe(false);

    store.set(openFilePreviewAtom, { filePath: "src/app.ts", startLine: 5 });

    expect(store.get(editorPanelOpenAtom)).toBe(true);
  });

  it("moves the current editor selection into the composer attachment", () => {
    const store = createStore();

    store.set(setEditorSelectionAttachmentAtom, {
      endLine: 27,
      filePath: "package.json",
      language: "json",
      selectedText: '"test": "vitest"',
      startLine: 25,
      surroundingContext: '"lint": "biome check",\n"test": "vitest"',
    });
    store.set(attachEditorSelectionToChatAtom);

    expect(store.get(chatComposerAttachmentAtom)).toEqual({
      endLine: 27,
      filePath: "package.json",
      language: "json",
      selectedText: '"test": "vitest"',
      startLine: 25,
      surroundingContext: '"lint": "biome check",\n"test": "vitest"',
    });
  });

  it("closes the active file and activates the nearest remaining tab", () => {
    const store = createStore();

    store.set(openFileAtom, "src/a.ts");
    store.set(openFileAtom, "src/b.ts");
    store.set(openFileAtom, "src/c.ts");
    store.set(closeFileAtom, "src/c.ts");

    expect(store.get(openFilesAtom)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(store.get(activeFileAtom)).toBe("src/b.ts");
  });

  it("keeps draft tabs isolated per workspace", () => {
    const store = createStore();

    store.set(openFileAtom, "/ws-a/file-a.ts");
    store.set(saveEditorDraftForWorkspaceAtom, "workspace-a");
    // Simulate switching to an empty workspace draft before opening B's files.
    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-b");
    expect(store.get(openFilesAtom)).toEqual([]);

    store.set(openFileAtom, "/ws-b/file-b.ts");
    store.set(saveEditorDraftForWorkspaceAtom, "workspace-b");

    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-a");
    expect(store.get(openFilesAtom)).toEqual(["/ws-a/file-a.ts"]);
    expect(store.get(activeFileAtom)).toBe("/ws-a/file-a.ts");

    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-b");
    expect(store.get(openFilesAtom)).toEqual(["/ws-b/file-b.ts"]);
    expect(store.get(activeFileAtom)).toBe("/ws-b/file-b.ts");

    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-empty");
    expect(store.get(openFilesAtom)).toEqual([]);
    expect(store.get(activeFileAtom)).toBeNull();

    store.set(restoreEditorDraftForWorkspaceAtom, null);
    expect(store.get(openFilesAtom)).toEqual([]);
    expect(store.get(editorDraftViewsByWorkspaceAtom)["workspace-a"]).toEqual({
      openFiles: ["/ws-a/file-a.ts"],
      activeFile: "/ws-a/file-a.ts",
      selections: [],
    });
  });

  it("cross-workspace draft handoff saves owner then restores target", () => {
    const store = createStore();

    // Simulate app-shell: open files on A, snapshot A, clear into B's draft.
    store.set(openFileAtom, "/ws-a/a.ts");
    store.set(openFileAtom, "/ws-a/b.ts");
    store.set(saveEditorDraftForWorkspaceAtom, "workspace-a");
    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-b");

    expect(store.get(openFilesAtom)).toEqual([]);
    expect(store.get(activeFileAtom)).toBeNull();

    store.set(openFileAtom, "/ws-b/only.ts");
    store.set(saveEditorDraftForWorkspaceAtom, "workspace-b");

    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-a");
    expect(store.get(openFilesAtom)).toEqual(["/ws-a/a.ts", "/ws-a/b.ts"]);
    expect(store.get(activeFileAtom)).toBe("/ws-a/b.ts");
  });

  it("session restore still loads session-scoped views independently of drafts", () => {
    const store = createStore();

    store.set(openFileAtom, "/ws-a/draft.ts");
    store.set(saveEditorDraftForWorkspaceAtom, "workspace-a");

    // Clear into a session-only view (openFile appends; snapshot the session alone).
    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-empty");
    store.set(openFileAtom, "/ws-a/session.ts");
    store.set(saveEditorViewSnapshotAtom, "session-1");

    store.set(restoreEditorDraftForWorkspaceAtom, "workspace-a");
    expect(store.get(openFilesAtom)).toEqual(["/ws-a/draft.ts"]);

    store.set(restoreEditorViewForSessionAtom, "session-1");
    expect(store.get(openFilesAtom)).toEqual(["/ws-a/session.ts"]);
    expect(store.get(activeFileAtom)).toBe("/ws-a/session.ts");

    // null session is a no-op at the session atom; draft restore is separate.
    store.set(openFileAtom, "/ws-a/after.ts");
    store.set(restoreEditorViewForSessionAtom, null);
    expect(store.get(openFilesAtom)).toEqual([
      "/ws-a/session.ts",
      "/ws-a/after.ts",
    ]);
  });
});
