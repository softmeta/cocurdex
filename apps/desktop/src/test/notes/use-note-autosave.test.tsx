import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcMock = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/features/notes/notes-ipc", () => ({
  notesIpc: ipcMock,
}));

import { useNoteAutosave } from "@/features/notes/editor/use-note-autosave";

// Minimal Tiptap editor stub: captures the update handler so tests can fire it.
function createFakeEditor() {
  let updateHandler: (() => void) | null = null;
  return {
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "update") {
        updateHandler = cb;
      }
    }),
    off: vi.fn(),
    getJSON: vi.fn(() => ({ type: "doc", content: [] })),
    getMarkdown: vi.fn(() => "# body\n"),
    fireUpdate: () => updateHandler?.(),
  };
}

function wrapStore(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  ipcMock.update.mockResolvedValue({
    id: "note-1.md",
    parentId: null,
    workspaceId: null,
    kind: "note",
    title: "note-1",
    icon: null,
    sortOrder: 0,
    revision: 2,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    bodyMarkdown: "# body\n",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNoteAutosave", () => {
  it("debounces rapid edits into a single save", async () => {
    const store = createStore();
    const editor = createFakeEditor();
    renderHook(() => useNoteAutosave(editor as never, "note-1.md", 1), {
      wrapper: wrapStore(store),
    });

    editor.fireUpdate();
    editor.fireUpdate();
    editor.fireUpdate();

    expect(ipcMock.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);

    expect(ipcMock.update).toHaveBeenCalledTimes(1);
    expect(ipcMock.update).toHaveBeenCalledWith({
      id: "note-1.md",
      bodyMarkdown: "# body\n",
      expectedRevision: 1,
    });
  });

  it("flushes pending edits on unmount", async () => {
    const store = createStore();
    const editor = createFakeEditor();
    const { unmount } = renderHook(
      () => useNoteAutosave(editor as never, "note-1.md", 1),
      { wrapper: wrapStore(store) },
    );

    editor.fireUpdate();
    unmount();

    await vi.runAllTimersAsync();
    expect(ipcMock.update).toHaveBeenCalledTimes(1);
  });

  it("attributes a save to the note that was active when edited", async () => {
    const store = createStore();
    const editor = createFakeEditor();
    const { rerender } = renderHook(
      ({ noteId }: { noteId: string }) =>
        useNoteAutosave(editor as never, noteId, 1),
      {
        initialProps: { noteId: "note-1.md" },
        wrapper: wrapStore(store),
      },
    );

    editor.fireUpdate();
    rerender({ noteId: "note-2.md" });
    await vi.runAllTimersAsync();

    expect(ipcMock.update).toHaveBeenCalledWith({
      id: "note-1.md",
      bodyMarkdown: "# body\n",
      expectedRevision: 1,
    });
  });
});
