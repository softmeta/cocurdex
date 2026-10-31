import { vi } from "vitest";

export function installTimelineTestLayout() {
  const heights = new Map<string, number>();
  const observers = new Set<{
    targets: Set<Element>;
    callback: ResizeObserverCallback;
  }>();
  const rowHeight = (element: HTMLElement) =>
    heights.get(element.dataset.conversationId ?? "") ?? 240;
  const contentHeight = (element: HTMLElement) => {
    const root = element.querySelector<HTMLElement>(
      '[data-testid="chat-timeline"]',
    );
    if (!root) return 600;
    if (root.style.height) return Number.parseFloat(root.style.height) + 48;
    return [...root.children].reduce(
      (total, row) => total + rowHeight(row as HTMLElement),
      48,
    );
  };
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.testid === "viewport") return 600;
      if (this.dataset.conversationId) return rowHeight(this);
      return Number.parseFloat(this.style.height) || 240;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return contentHeight(this as HTMLElement);
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const element = this as HTMLElement;
      const viewport = element.closest<HTMLElement>('[data-testid="viewport"]');
      const row = element.closest<HTMLElement>("[data-conversation-id]");
      let top = 0;
      let height = 600;
      if (row) {
        const offset =
          Number.parseFloat(row.style.transform.slice("translateY(".length)) ||
          0;
        top = 24 + offset - (viewport?.scrollTop ?? 0);
        height = rowHeight(row);
      } else if (element.dataset.testid === "chat-timeline") {
        top = 24 - (viewport?.scrollTop ?? 0);
        height = Number.parseFloat(element.style.height) || 0;
      }
      return new DOMRect(0, top, 800, height);
    },
  );
  const previousScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollTo = function (
    options: ScrollToOptions | number = {},
    y: number = 0,
  ) {
    this.scrollTop = typeof options === "number" ? y : (options.top ?? 0);
    queueMicrotask(() => this.dispatchEvent(new Event("scroll")));
  };
  const emitResize = (element: Element) => {
    for (const observer of observers) {
      if (!observer.targets.has(element)) continue;
      observer.callback(
        [
          {
            target: element,
            borderBoxSize: [
              {
                inlineSize: 800,
                blockSize: (element as HTMLElement).offsetHeight,
              },
            ],
            contentRect: element.getBoundingClientRect(),
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    }
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      targets = new Set<Element>();
      constructor(public callback: ResizeObserverCallback) {
        observers.add(this);
      }
      observe(element: Element) {
        this.targets.add(element);
        queueMicrotask(() => {
          if (this.targets.has(element)) emitResize(element);
        });
      }
      unobserve(element: Element) {
        this.targets.delete(element);
      }
      disconnect() {
        this.targets.clear();
        observers.delete(this);
      }
    },
  );
  return {
    heights,
    emitResize,
    restore() {
      HTMLElement.prototype.scrollTo = previousScrollTo;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}
