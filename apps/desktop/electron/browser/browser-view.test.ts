import { beforeEach, describe, expect, it, vi } from "vitest";

const constructorOptions: Array<Record<string, unknown>> = [];
const setWindowOpenHandlerMock = vi.fn();

vi.mock("electron", () => {
  class FakeWebContentsView {
    webContents = {
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: setWindowOpenHandlerMock,
      executeJavaScript: vi.fn(),
    };

    constructor(options: Record<string, unknown>) {
      constructorOptions.push(options);
    }

    setVisible() {}
    setBackgroundColor() {}
  }

  return {
    WebContentsView: FakeWebContentsView,
    BrowserWindow: { getAllWindows: () => [] },
  };
});

vi.mock("../app-paths", () => ({
  resolveElectronEntryPath: () => "/preload/browser-preload.cjs",
}));

vi.mock("./annotation-script", () => ({
  getAnnotationScript: () => "",
}));

describe("createBrowserView security hardening", () => {
  beforeEach(() => {
    vi.resetModules();
    constructorOptions.length = 0;
    setWindowOpenHandlerMock.mockClear();
  });

  async function createView() {
    const { createBrowserView } = await import("./browser-view");
    return createBrowserView();
  }

  it("runs untrusted web content in a sandboxed renderer", async () => {
    await createView();
    expect(constructorOptions).toHaveLength(1);
    expect(constructorOptions[0].webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });

  it("denies window.open popups from the browsed page", async () => {
    await createView();
    expect(setWindowOpenHandlerMock).toHaveBeenCalledTimes(1);
    const handler = setWindowOpenHandlerMock.mock.calls[0][0];
    expect(handler({ url: "https://evil.example/popup" })).toEqual({
      action: "deny",
    });
  });
});
