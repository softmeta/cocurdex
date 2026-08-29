import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcMock = vi.hoisted(() => ({
  rename: vi.fn(),
}));

vi.mock("@/features/notes/notes-ipc", () => ({
  notesIpc: ipcMock,
}));

import { useDebouncedNoteRename } from "@/features/notes/editor/note-editor-sync";

function wrapStore(store: ReturnType<typeof createStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  ipcMock.rename.mockImplementation(
    async ({ id, title }: { id: string; title: string }) => ({
      id,
      title,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedNoteRename", () => {
  it("debounces rapid keystrokes into a single rename", async () => {
    const store = createStore();
    const onRenamed = vi.fn();
    const { result } = renderHook(
      () => useDebouncedNoteRename({ noteId: "note-1.md", onRenamed }),
      { wrapper: wrapStore(store) },
    );

    result.current("H");
    result.current("He");
    result.current("Hello");

    expect(ipcMock.rename).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);

    expect(ipcMock.rename).toHaveBeenCalledTimes(1);
    expect(ipcMock.rename).toHaveBeenCalledWith({
      id: "note-1.md",
      title: "Hello",
    });
    expect(onRenamed).toHaveBeenCalledWith("Hello");
  });
});
