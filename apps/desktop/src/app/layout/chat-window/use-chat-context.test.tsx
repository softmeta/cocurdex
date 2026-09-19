import type { ContextFolderAttachment } from "@cocurdex/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatContextInput,
  outgoingChatContextAtom,
  requestChatContextAtom,
} from "@/lib/chat-context-store";
import type {
  ChatWindowIntentRequest,
  ChatWindowSurface,
} from "@/lib/chat-window-types";
import { chatWindowStateAtom } from "./chat-window-state";
import { useChatContext } from "./use-chat-context";

const fixture = vi.hoisted(() => ({
  pending: [] as ChatWindowIntentRequest[],
  listeners: new Set<() => void>(),
  dispatched: [] as {
    id?: string;
    surface: ChatWindowSurface;
    intent: ChatWindowIntentRequest["intent"];
  }[],
  acknowledgements: [] as string[],
}));
vi.mock("@/lib/ipc", () => ({
  desktopApi: {
    chatWindow: {
      getPendingIntents: async () => fixture.pending,
      dispatchIntent: async (request: {
        id?: string;
        surface: ChatWindowSurface;
        intent: ChatWindowIntentRequest["intent"];
      }) => {
        fixture.dispatched.push(request);
      },
      acknowledgeIntent: async (id: string) => {
        fixture.acknowledgements.push(id);
        fixture.pending = fixture.pending.filter(
          (request) => request.id !== id,
        );
      },
      onIntentAvailable: (listener: () => void) => {
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
function composerInput(
  id: string,
  input: ChatContextInput,
): ChatWindowIntentRequest {
  return {
    id,
    surface: "chat",
    intent: { kind: "composer-input", input },
  };
}

beforeEach(() => {
  fixture.pending = [];
  fixture.listeners.clear();
  fixture.dispatched = [];
  fixture.acknowledgements = [];
});

describe("chat context receiver", () => {
  it("waits for a composer and appends each context once without replacing drafts", async () => {
    fixture.pending = [
      composerInput("file", { kind: "attachment", attachment: folder }),
      composerInput("pdf", { kind: "text", text: "PDF selection" }),
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

  it("ignores intents addressed at other surfaces", async () => {
    fixture.pending = [
      {
        id: "file-open",
        surface: "shell",
        intent: { kind: "open-file", filePath: "/work/example.ts" },
      },
    ];
    const { result, reveal } = setup();
    const composer = {
      insertContextMention: vi.fn(() => true),
      insertText: vi.fn(() => true),
    };
    act(() => {
      result.current(composer);
      signal();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(reveal).not.toHaveBeenCalled();
    expect(composer.insertText).not.toHaveBeenCalled();
    expect(fixture.acknowledgements).toEqual([]);
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
      composerInput("folder", { kind: "attachment", attachment: folder }),
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
        composerInput("pdf", { kind: "text", text: "quoted PDF" }),
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
    expect(
      fixture.dispatched.map((request) => ({
        surface: request.surface,
        input:
          request.intent.kind === "composer-input"
            ? request.intent.input
            : null,
      })),
    ).toEqual([
      {
        surface: "chat",
        input: { kind: "attachment", attachment: folder },
      },
      { surface: "chat", input: { kind: "text", text: "PDF" } },
    ]);
  });
});
