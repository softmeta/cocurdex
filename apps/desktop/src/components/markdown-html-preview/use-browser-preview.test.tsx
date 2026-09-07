import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserPreview } from "./use-browser-preview";

const { open, update } = vi.hoisted(() => ({
  open: vi.fn().mockResolvedValue("preview-url"),
  update: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib", () => ({
  desktopApi: { browserUpdateHtml: update },
  openHtmlPreviewInBrowser: open,
  htmlPreviewSourceId: async (code: string) => code,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("browser preview lifecycle", () => {
  it("opens streaming HTML, flushes completion, and leaves history alone", async () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ code, incomplete, enabled }) =>
        useBrowserPreview(code, incomplete, enabled),
      { initialProps: { code: "<p>First", incomplete: true, enabled: true } },
    );
    await act(async () => {});
    expect(open).toHaveBeenCalledTimes(1);
    rerender({ code: "<p>Final</p>", incomplete: false, enabled: true });
    await act(async () => {});
    expect(update).toHaveBeenLastCalledWith(
      "preview-url",
      expect.stringContaining("<p>Final</p>"),
      "<p>Final</p>",
      false,
    );
    expect(update.mock.calls.at(-1)?.[1]).toContain(
      "script-src 'unsafe-inline'",
    );
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    renderHook(() => useBrowserPreview("<p>History</p>", false, true));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not open the browser when chat preview is selected", () => {
    renderHook(() => useBrowserPreview("<p>Streaming", true, false));
    expect(open).not.toHaveBeenCalled();
  });
});
