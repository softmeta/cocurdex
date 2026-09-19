import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatWindowIntentRequest } from "@/lib/chat-window-types";
import { useChatWindowIntents } from "./use-chat-intents";

const fixture = vi.hoisted(() => ({
  pending: [] as ChatWindowIntentRequest[],
  listeners: new Set<() => void>(),
  acknowledgements: [] as string[],
}));
vi.mock("@/lib/ipc", () => ({
  desktopApi: {
    chatWindow: {
      getPendingIntents: async () => fixture.pending,
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

function signal() {
  for (const listener of fixture.listeners) listener();
}
function openFile(id: string, filePath: string): ChatWindowIntentRequest {
  return {
    id,
    surface: "shell",
    intent: { kind: "open-file", filePath },
  };
}

beforeEach(() => {
  fixture.pending = [];
  fixture.listeners.clear();
  fixture.acknowledgements = [];
});

describe("chat window intents", () => {
  it("delivers pending intents once and acknowledges them", async () => {
    const handle = vi.fn(() => true);
    renderHook(() => useChatWindowIntents(handle));
    fixture.pending = [
      openFile("a", "/work/a.ts"),
      openFile("b", "/work/b.ts"),
    ];
    act(signal);
    await waitFor(() => expect(fixture.pending).toEqual([]));
    expect(handle).toHaveBeenCalledTimes(2);
    expect(handle).toHaveBeenNthCalledWith(1, {
      kind: "open-file",
      filePath: "/work/a.ts",
    });
    expect(fixture.acknowledgements).toEqual(["a", "b"]);
    fixture.pending = [openFile("a", "/work/a.ts")];
    act(signal);
    await act(async () => {
      await Promise.resolve();
    });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("leaves declined intents queued for a later consumer", async () => {
    const handle = vi.fn(
      (intent: ChatWindowIntentRequest["intent"]) =>
        intent.kind === "composer-input",
    );
    renderHook(() => useChatWindowIntents(handle));
    fixture.pending = [openFile("a", "/work/a.ts")];
    act(signal);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fixture.pending).toHaveLength(1);
    expect(fixture.acknowledgements).toEqual([]);
    handle.mockReturnValue(true);
    act(signal);
    await waitFor(() => expect(fixture.pending).toEqual([]));
    expect(fixture.acknowledgements).toEqual(["a"]);
  });
});
