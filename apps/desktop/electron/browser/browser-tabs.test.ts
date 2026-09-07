import type { BrowserTab } from "@cocurdex/shared";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { views } = vi.hoisted(() => ({
  views: [] as Array<{
    state: BrowserTab;
    changed: () => void;
    setVisible: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
    webContents: {
      id: number;
      loadURL: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      executeJavaScriptInIsolatedWorld: ReturnType<typeof vi.fn>;
      capturePage: ReturnType<typeof vi.fn>;
    };
  }>,
}));
vi.mock("./browser-view", () => ({
  createBrowserView: (state: BrowserTab, changed: () => void) => {
    const view = {
      state,
      changed,
      setVisible: vi.fn(),
      setBounds: vi.fn(),
      webContents: {
        id: views.length + 1,
        loadURL: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        capturePage: vi.fn().mockResolvedValue({}),
        executeJavaScriptInIsolatedWorld: vi
          .fn()
          .mockResolvedValue({ title: "Preview", top: 0, follow: false }),
      },
    };
    views.push(view);
    return { view, toggleAnnotation: vi.fn() };
  },
}));
vi.mock("./html-preview-protocol", async () => {
  const { HtmlPreviewStore } = await import("./html-preview-store");
  return { browserHtmlPreviews: new HtmlPreviewStore() };
});

async function setup() {
  const manager = await import("./browser-tabs");
  const callbacks = new Map<string, () => void>();
  const host = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    once: (event: string, callback: () => void) =>
      callbacks.set(event, callback),
  };
  manager.attachBrowserHost(host as unknown as BrowserWindow);
  return { ...manager, host, callbacks };
}

beforeEach(() => {
  vi.resetModules();
  views.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("browser tab lifecycle", () => {
  it("keeps the old view until preparation finishes and does not reveal a background tab", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A", true);
    browser.setBrowserVisible(true);
    const finishing = browser.updateBrowserHtml(url, "Final", "A", false);
    let ready!: () => void;
    views[1].webContents.loadURL.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    await vi.waitFor(() => expect(ready).toBeDefined());
    expect(browser.getBrowserView()).toBe(views[0]);
    expect(views[0].webContents.close).not.toHaveBeenCalled();
    expect(views[1].setVisible).not.toHaveBeenCalledWith(true);
    await browser.openBrowserHtml("B", "B");
    ready();
    await finishing;
    expect(browser.getBrowserView()).toBe(views[2]);
    expect(views[1].setVisible).toHaveBeenLastCalledWith(false);
    expect(views[0].webContents.close).toHaveBeenCalledOnce();
  });

  it("disposes the replacement when the user closes the tab during preparation", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A", true);
    const id = browser.getBrowserTabs().activeId as string;
    const finishing = browser.updateBrowserHtml(url, "Final", "A", false);
    views[1].webContents.loadURL.mockImplementation(
      () => new Promise(() => {}),
    );
    await vi.waitFor(() =>
      expect(views[1].webContents.loadURL).toHaveBeenCalled(),
    );
    browser.closeBrowserTab(id);
    await finishing;
    expect(browser.getBrowserTabs().tabs).toHaveLength(0);
    expect(views[1].webContents.close).toHaveBeenCalledOnce();
    expect(views[1].setVisible).not.toHaveBeenCalledWith(true);
  });

  it("retains the old preview and reports a failed final load", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A", true);
    const finishing = browser.updateBrowserHtml(url, "Final", "A", false);
    views[1].webContents.loadURL.mockRejectedValue(
      new Error("Final page failed"),
    );
    await finishing;
    expect(browser.getBrowserView()).toBe(views[0]);
    expect(views[0].webContents.close).not.toHaveBeenCalled();
    expect(views[1].webContents.close).toHaveBeenCalledOnce();
    expect(browser.getBrowserTabs().tabs[0]).toMatchObject({
      previewError: "Final page failed",
      error: null,
      streaming: false,
    });
  });

  it("times out a stalled final page without discarding the preview", async () => {
    vi.useFakeTimers();
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A", true);
    const finishing = browser.updateBrowserHtml(url, "Final", "A", false);
    views[1].webContents.loadURL.mockImplementation(
      () => new Promise(() => {}),
    );
    await vi.advanceTimersByTimeAsync(8001);
    await finishing;
    expect(browser.getBrowserView()).toBe(views[0]);
    expect(views[1].webContents.close).toHaveBeenCalledOnce();
    expect(browser.getBrowserTabs().tabs[0].previewError).toContain(
      "timed out",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("patches streaming snapshots without reloading and loads the completed document once", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("<p>First", "stream", true);
    await browser.updateBrowserHtml(url, "<p>Second", "second", true);
    await browser.updateBrowserHtml(url, "<p>Third", "third", true);
    expect(views[0].webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(browser.getBrowserTabs().tabs[0].streaming).toBe(true);
    await browser.updateBrowserHtml(url, "<p>Final</p>", "final", false);
    expect(views[0].webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(views[1].webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(views[0].webContents.close).toHaveBeenCalledOnce();
    expect(browser.getBrowserView()).toBe(views[1]);
    expect(browser.getBrowserTabs().tabs[0].streaming).toBe(false);
  });
  it("deduplicates the same source and retains each page instance when switching", async () => {
    const browser = await setup();
    const first = await browser.openBrowserHtml("<p>A</p>", "A");
    await browser.openBrowserHtml("<p>B</p>", "B");
    browser.setBrowserVisible(true);
    const secondView = browser.getBrowserView();
    expect(await browser.openBrowserHtml("<p>A</p>", "A")).toBe(first);
    expect(browser.getBrowserTabs().tabs).toHaveLength(2);
    expect(browser.getBrowserView()).toBe(views[0]);
    expect(secondView).toBe(views[1]);
    expect(views[1].setVisible).toHaveBeenLastCalledWith(false);
    expect(views[0].setVisible).toHaveBeenLastCalledWith(true);
    expect(views[0].webContents.loadURL).toHaveBeenCalledTimes(1);
  });

  it("updates a background preview without activating it and recognizes its completed content", async () => {
    const browser = await setup();
    const first = await browser.openBrowserHtml("<p>Starting", "stream");
    await browser.openBrowserHtml("<p>B</p>", "B");
    const active = browser.getBrowserTabs().activeId;
    expect(
      await browser.updateBrowserHtml(first, "<p>Finished</p>", "completed"),
    ).toBe(true);
    expect(browser.getBrowserTabs().activeId).toBe(active);
    expect(views[1].webContents.loadURL).toHaveBeenCalledTimes(1);
    expect(await browser.openBrowserHtml("<p>Finished</p>", "completed")).toBe(
      first,
    );
    expect(browser.getBrowserTabs().tabs).toHaveLength(2);
  });

  it("keeps background title and errors on their owning tab", async () => {
    const browser = await setup();
    await browser.openBrowserHtml("A", "A");
    await browser.openBrowserHtml("B", "B");
    views[0].state.title = "Background";
    views[0].state.error = "Offline";
    views[0].changed();
    const snapshot = browser.getBrowserTabs();
    expect(snapshot.tabs[0]).toMatchObject({
      title: "Background",
      error: "Offline",
    });
    expect(snapshot.tabs[1]).toMatchObject({ title: "", error: null });
    expect(browser.host.webContents.send).toHaveBeenLastCalledWith(
      "browser:tabs",
      snapshot,
    );
  });

  it("closes background tabs without switching and selects a neighbor when the active tab closes", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A");
    const first = browser.getBrowserTabs().activeId as string;
    await browser.openBrowserHtml("B", "B");
    const second = browser.getBrowserTabs().activeId as string;
    await browser.openBrowserHtml("C", "C");
    const third = browser.getBrowserTabs().activeId;
    browser.closeBrowserTab(second);
    expect(browser.getBrowserTabs().activeId).toBe(third);
    browser.closeBrowserTab(third as string);
    expect(browser.getBrowserTabs().activeId).toBe(first);
    expect(browser.closeBrowserTab(first)).toEqual({
      tabs: [],
      activeId: null,
    });
    expect(await browser.updateBrowserHtml(url, "late update", "A")).toBe(
      false,
    );
    expect(browser.getBrowserTabs().tabs).toHaveLength(0);
    expect(
      views.every((view) => view.webContents.close.mock.calls.length === 1),
    ).toBe(true);
    expect(browser.host.contentView.removeChildView).toHaveBeenCalledTimes(3);
    const { browserHtmlPreviews } = await import("./html-preview-protocol");
    expect(browserHtmlPreviews.read(url)).toBeUndefined();
  });

  it("updates stored HTML without navigating away from a page the user opened", async () => {
    const browser = await setup();
    const url = await browser.openBrowserHtml("A", "A");
    await browser.navigateBrowser("https://example.com");
    views[0].webContents.loadURL.mockClear();
    expect(await browser.updateBrowserHtml(url, "new A", "A")).toBe(true);
    expect(views[0].webContents.loadURL).not.toHaveBeenCalled();
    expect(browser.getBrowserTabs().tabs[0].url).toBe("https://example.com");
  });

  it("preserves hidden visibility across activation and destroys every view with its host", async () => {
    const browser = await setup();
    await browser.openBrowserHtml("A", "A");
    browser.setBrowserVisible(false);
    await browser.openBrowserHtml("B", "B");
    expect(
      views.every((view) => view.setVisible.mock.lastCall?.[0] === false),
    ).toBe(true);
    browser.callbacks.get("closed")?.();
    expect(browser.getBrowserTabs()).toEqual({ tabs: [], activeId: null });
    expect(
      views.every((view) => view.webContents.close.mock.calls.length === 1),
    ).toBe(true);
  });

  it("does not resurrect a tab closed before its initial navigation finishes", async () => {
    const browser = await setup();
    const pending = browser.openBrowserHtml("A", "A");
    const id = browser.getBrowserTabs().activeId as string;
    browser.closeBrowserTab(id);
    await pending;
    expect(browser.getBrowserTabs().tabs).toHaveLength(0);
  });
});
