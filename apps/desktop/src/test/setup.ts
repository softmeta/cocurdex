import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { i18n } from "@/i18n";

Object.defineProperty(window, "innerWidth", {
  configurable: true,
  value: 1440,
  writable: true,
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: query.includes("dark"),
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  })),
});

if (typeof globalThis.PointerEvent === "undefined") {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number;

    constructor(
      type: string,
      init?: PointerEventInit & { pointerId?: number },
    ) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  } as typeof PointerEvent;
}

class ResizeObserverMock implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observedTargets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  disconnect = vi.fn(() => {
    this.observedTargets.clear();
  });
  observe = vi.fn((target: Element) => {
    this.observedTargets.add(target);

    queueMicrotask(() => {
      if (!this.observedTargets.has(target)) {
        return;
      }

      const width =
        target instanceof HTMLElement && target.clientWidth > 0
          ? target.clientWidth
          : window.innerWidth;

      this.callback(
        [
          {
            contentRect: {
              width,
            } as DOMRectReadOnly,
            target,
          } as ResizeObserverEntry,
        ],
        this,
      );
    });
  });
  unobserve = vi.fn((target: Element) => {
    this.observedTargets.delete(target);
  });
}

globalThis.ResizeObserver = ResizeObserverMock;

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return window.innerWidth;
  },
});

Element.prototype.scrollIntoView = vi.fn();

Object.defineProperty(Element.prototype, "getAnimations", {
  configurable: true,
  value: vi.fn(() => []),
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => null),
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  void i18n.changeLanguage("en-US");
});
