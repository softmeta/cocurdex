import type { ContextFolderAttachment } from "@cocurdex/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatContextRequest,
  outgoingChatContextAtom,
  requestChatContextAtom,
} from "@/lib/chat-context-store";
import { chatWindowStateAtom } from "./chat-window-state";
import { useChatContext } from "./use-chat-context";

const fixture = vi.hoisted(() => ({
  pending: [] as ChatContextRequest[],
  listeners: new Set<() => void>(),
  added: [] as ChatContextRequest[],
  acknowledgements: [] as string[],
}));
vi.mock("@/lib/ipc", () => ({
  desktopApi: {
    chatWindow: {
      getPendingContext: async () => fixture.pending,
      addContext: async (request: ChatContextRequest) => {
        fixture.added.push(request);
      },
      acknowledgeContext: async (id: string) => {
        fixture.acknowledgements.push(id);
        fixture.pending = fixture.pending.filter(
          (request) => request.id !== id,
        );
      },
      onContextAvailable: (listener: () => void) => {
        fixture.listeners.add(listener);
        return () => fixture.listeners.delete(listener);
      },
    },
  },
}));
vi.mock("./chat-window-state", async () => {
  const { atom } = await import("jotai");
  return {
    isDetachedChatWindow: true,
    chatWindowBusyAtom: atom(false),
    chatWindowStateAtom: atom({ detached: true, transitioning: false }),
  };
});

function setup() {
  const store = createStore();
  const reveal = vi.fn();
  const hook = renderHook(() => useChatContext(reveal), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
  return { ...hook, store, reveal };
}
function signal() {
  for (const listener of fixture.listeners) listener();
}
const folder: ContextFolderAttachment = {
  kind: "context-folder",
  folderPath: "/work/src",
};

beforeEach(() => {
  fixture.pending = [];
  fixture.listeners.clear();
  fixture.added = [];
  fixture.acknowledgements = [];
});

describe("chat context receiver", () => {
  it("waits for a composer and appends each context once without replacing drafts", async () => {
    fixture.pending = [
      { id: "file", input: { kind: "attachment", attachment: folder } },
      { id: "pdf", input: { kind: "text", text: "PDF selection" } },
    ];
    const { result, reveal } = setup();
    await waitFor(() => expect(reveal).toHaveBeenCalled());
    expect(fixture.acknowledgements).toEqual([]);
    const draft: unknown[] = ["existing draft"];
    const composer = {
      insertContextMention: vi.fn((attachment) => {
        draft.push(attachment);
        return true;
      }),
      insertText: vi.fn((text) => {
        draft.push(text);
        return true;
      }),
    };
    act(() => {
      result.current(composer);
      signal();
      signal();
    });
    await waitFor(() => expect(fixture.pending).toEqual([]));
    expect(draft).toEqual(["existing draft", folder, "PDF selection"]);
  });

  it("uses the currently focused composer instead of the source window or an earlier pane", async () => {
    const { result } = setup();
    const first = {
      insertContextMention: vi.fn(() => true),
      insertText: vi.fn(() => true),
    };
    const focused = {
      insertContextMention: vi.fn(() => true),
      insertText: vi.fn(() => true),
    };
    act(() => {
      result.current(first);
      result.current(focused);
    });
    fixture.pending = [
      { id: "folder", input: { kind: "attachment", attachment: folder } },
    ];
    act(signal);
    await waitFor(() =>
      expect(focused.insertContextMention).toHaveBeenCalledWith(folder),
    );
    expect(first.insertContextMention).not.toHaveBeenCalled();
  });

  it("leaves context queued during handoff and consumes it after ownership becomes ready", async () => {
    const { result, store } = setup();
    const composer = {
      insertContextMention: vi.fn(() => true),
      insertText: vi.fn(() => true),
    };
    act(() => {
      store.set(chatWindowStateAtom, { detached: false, transitioning: true });
      result.current(composer);
      fixture.pending = [
        { id: "pdf", input: { kind: "text", text: "quoted PDF" } },
      ];
      signal();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(composer.insertText).not.toHaveBeenCalled();
    expect(fixture.acknowledgements).toEqual([]);
    act(() => {
      store.set(chatWindowStateAtom, { detached: true, transitioning: false });
    });
    await waitFor(() =>
      expect(composer.insertText).toHaveBeenCalledWith("quoted PDF"),
    );
  });

  it("forwards file and text requests without leaving stale context in the source window", async () => {
    const { store } = setup();
    act(() => {
      store.set(requestChatContextAtom, {
        kind: "attachment",
        attachment: folder,
      });
      store.set(requestChatContextAtom, { kind: "text", text: "PDF" });
    });
    await waitFor(() => expect(store.get(outgoingChatContextAtom)).toEqual([]));
    expect(fixture.added.map((request) => request.input)).toEqual([
      { kind: "attachment", attachment: folder },
      { kind: "text", text: "PDF" },
    ]);
  });
});
