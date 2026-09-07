import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createHtmlPreviewDocument } from "./preview-document";

describe("HTML stream follow scrolling", () => {
  it("scrolls the preview viewport on load and when streamed content grows", () => {
    const document = new DOMParser().parseFromString(
      createHtmlPreviewDocument("<main>Streaming content</main>", true),
      "text/html",
    );
    const script = document.querySelector("script[nonce]");
    expect(script).not.toBeNull();

    const scrollTo = vi.fn();
    let resize: (() => void) | undefined;
    class PreviewResizeObserver {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 1500,
    });
    runInNewContext(script?.textContent ?? "", {
      document,
      window: { scrollTo, addEventListener: vi.fn() },
      ResizeObserver: PreviewResizeObserver,
      requestAnimationFrame: (callback: () => void) => callback(),
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1500,
      behavior: "instant",
    });

    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2400,
    });
    resize?.();
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 2400,
      behavior: "instant",
    });
  });
});
