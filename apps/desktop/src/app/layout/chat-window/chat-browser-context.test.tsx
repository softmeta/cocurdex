import type { BrowserAnnotation } from "@cocurdex/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAnnotationAtom,
  clearAnnotationsAtom,
  receiveBrowserTabsAtom,
} from "@/features/browser/browser-store";
import {
  chatBrowserAnnotationsAtom,
  useChatBrowserContext,
} from "./chat-browser-context";

const fixture = vi.hoisted(() => ({
  detached: true,
  listeners: new Set<(annotations: BrowserAnnotation[]) => void>(),
  initial: Promise.resolve([] as BrowserAnnotation[]),
  publish: vi.fn(),
}));
vi.mock("./chat-window-state", () => ({
  get isDetachedChatWindow() {
    return fixture.detached;
  },
}));
vi.mock("@/features/browser", () => import("@/features/browser/browser-store"));
vi.mock("@/lib/ipc", () => ({
  desktopApi: {
    chatWindow: {
      setBrowserContext: async (annotations: BrowserAnnotation[]) =>
        fixture.publish(annotations),
      getBrowserContext: () => fixture.initial,
      onBrowserContext: (
        listener: (annotations: BrowserAnnotation[]) => void,
      ) => {
        fixture.listeners.add(listener);
        return () => fixture.listeners.delete(listener);
      },
    },
  },
}));
const annotation: BrowserAnnotation = {
  id: "capture",
  type: "region",
  pageUrl: "https://example.test",
  regionScreenshot: "data:image/png;base64,aGVsbG8=",
  boundingBox: { x: 1, y: 2, width: 30, height: 40 },
  capturedAt: "2026-09-18",
  note: "Review layout",
};
function setup() {
  const store = createStore();
  const hook = renderHook(
    () => {
      useChatBrowserContext();
      return useAtomValue(chatBrowserAnnotationsAtom);
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
  return { ...hook, store };
}
beforeEach(() => {
  fixture.detached = true;
  fixture.initial = Promise.resolve([]);
  fixture.listeners.clear();
  fixture.publish.mockClear();
});

describe("browser context across chat windows", () => {
  it("hydrates screenshots captured before detach and applies removals", async () => {
    fixture.initial = Promise.resolve([annotation]);
    const { result } = setup();
    await waitFor(() => expect(result.current).toEqual([annotation]));
    act(() => {
      for (const listener of fixture.listeners) listener([]);
    });
    expect(result.current).toEqual([]);
  });
  it("does not overwrite a newer tab selection with a delayed initial snapshot", async () => {
    let resolve: (annotations: BrowserAnnotation[]) => void = () => {};
    fixture.initial = new Promise((done) => {
      resolve = done;
    });
    const { result } = setup();
    act(() => {
      for (const listener of fixture.listeners) listener([annotation]);
    });
    await act(async () => {
      resolve([]);
    });
    expect(result.current).toEqual([annotation]);
  });
  it("publishes replacements and clears from the main browser without altering annotation data", async () => {
    fixture.detached = false;
    const { store } = setup();
    act(() => {
      store.set(receiveBrowserTabsAtom, {
        tabs: [
          {
            id: "a",
            url: annotation.pageUrl,
            title: "A",
            error: null,
            loading: false,
          },
        ],
        activeId: "a",
      });
      store.set(addAnnotationAtom, annotation);
    });
    await waitFor(() =>
      expect(fixture.publish).toHaveBeenLastCalledWith([annotation]),
    );
    act(() => {
      store.set(clearAnnotationsAtom);
    });
    await waitFor(() => expect(fixture.publish).toHaveBeenLastCalledWith([]));
  });
});
