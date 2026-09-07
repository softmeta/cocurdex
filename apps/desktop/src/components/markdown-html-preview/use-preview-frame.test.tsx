import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePreviewFrame } from "./use-preview-frame";

afterEach(() => vi.useRealTimers());

describe("HTML preview streaming", () => {
  it("throttles continuous updates and immediately flushes the completed document", () => {
    vi.useFakeTimers();
    const frame = document.createElement("iframe");
    const { result, rerender, unmount } = renderHook(
      ({ code, incomplete }) => usePreviewFrame(code, incomplete),
      { initialProps: { code: "<p>First", incomplete: true } },
    );
    act(() => result.current(frame));
    expect(frame.srcdoc).toContain("<p>First");
    const firstDocument = frame.srcdoc;
    act(() => vi.advanceTimersByTime(250));
    expect(frame.srcdoc).toBe(firstDocument);

    rerender({ code: "<p>Second", incomplete: true });
    act(() => vi.advanceTimersByTime(200));
    rerender({ code: "<p>Third", incomplete: true });
    expect(frame.srcdoc).not.toContain("<p>Third");
    act(() => vi.advanceTimersByTime(50));
    expect(frame.srcdoc).toContain("<p>Third");
    expect(frame.srcdoc).toContain("script-src 'nonce-");

    rerender({ code: "<p>Done</p>", incomplete: false });
    expect(frame.srcdoc).toContain("<p>Done</p>");
    expect(frame.srcdoc).toContain("script-src 'unsafe-inline'");
    expect(frame.srcdoc).toContain("window.scrollTo");
    expect(vi.getTimerCount()).toBe(0);

    rerender({ code: "<p>Edited</p>", incomplete: false });
    expect(frame.srcdoc).toContain("<p>Edited</p>");
    unmount();
  });

  it("stops streaming updates when the preview closes", () => {
    vi.useFakeTimers();
    const frame = document.createElement("iframe");
    const { result, unmount } = renderHook(() =>
      usePreviewFrame("<p>Streaming", true),
    );
    act(() => result.current(frame));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens an already completed preview at the top", () => {
    const frame = document.createElement("iframe");
    const { result } = renderHook(() => usePreviewFrame("<p>Saved</p>", false));
    act(() => result.current(frame));
    expect(frame.srcdoc).not.toContain("window.scrollTo");
  });
});
