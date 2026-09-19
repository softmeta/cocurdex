import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatWindowState,
  ChatWindowTransfer,
} from "../../src/lib/chat-window-types";

const fixture = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as WindowStub[],
  appListeners: new Map<string, () => void>(),
}));

class WindowStub extends EventEmitter {
  id = fixture.windows.length + 1;
  destroyed = false;
  visible = false;
  webContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: vi.fn(),
    reload: vi.fn(),
  });
  constructor() {
    super();
    fixture.windows.push(this);
  }
  isDestroyed() {
    return this.destroyed;
  }
  minimized = false;
  isMinimized() {
    return this.minimized;
  }
  isVisible() {
    return this.visible;
  }
  restore() {
    this.minimized = false;
  }
  show() {
    this.visible = true;
  }
  hide() {
    this.visible = false;
  }
  focus() {}
  destroy() {
    this.destroyed = true;
    this.emit("closed");
  }
}

vi.mock("electron", () => ({
  app: {
    on: (name: string, listener: () => void) =>
      fixture.appListeners.set(name, listener),
  },
  BrowserWindow: {
    fromWebContents: (contents: unknown) =>
      fixture.windows.find((window) => window.webContents === contents),
  },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      fixture.handlers.set(name, handler),
  },
}));
vi.mock("./chat-window-factory", () => ({
  createChatWindow: () => new WindowStub(),
  loadChatWindow: async () => {},
}));

import type { BrowserWindow } from "electron";
import { registerChatWindowHandlers } from "./chat-window-handlers";

function invoke(window: WindowStub, name: "state"): ChatWindowState;
function invoke(window: WindowStub, name: "bootstrap"): ChatWindowTransfer;
function invoke(window: WindowStub, name: string, value?: unknown): unknown;
function invoke(window: WindowStub, name: string, value?: unknown) {
  const handler = fixture.handlers.get(`chatWindow:${name}`);
  if (!handler) throw new Error(`Missing handler: ${name}`);
  return handler(
    { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    value,
  );
}

function setup() {
  const primary = new WindowStub();
  const manager = registerChatWindowHandlers({
    preloadPath: "preload.cjs",
    rendererHtmlPath: "index.html",
    createPrimaryWindow: () => {
      const window = new WindowStub();
      manager.setPrimaryWindow(window as unknown as BrowserWindow);
      return window as unknown as BrowserWindow;
    },
  });
  manager.setPrimaryWindow(primary as unknown as BrowserWindow);
  return primary;
}

async function detach(primary: WindowStub) {
  const opening = invoke(primary, "detach", "original draft");
  const chat = fixture.windows.at(-1) as WindowStub;
  const transfer = invoke(chat, "bootstrap");
  invoke(chat, "ready", transfer.id);
  await opening;
  return chat;
}

beforeEach(() => {
  fixture.handlers.clear();
  fixture.windows.length = 0;
  fixture.appListeners.clear();
});

describe("independent chat window lifecycle", () => {
  it("waits for readiness and reuses the existing window on repeated opens", async () => {
    const primary = setup();
    const opening = invoke(primary, "detach", "draft with image");
    const chat = fixture.windows[1] as WindowStub;
    expect(invoke(primary, "state")).toEqual({
      detached: false,
      transitioning: true,
    });
    expect(chat.visible).toBe(false);
    const transfer = invoke(chat, "bootstrap");
    expect(transfer.snapshot).toBe("draft with image");
    invoke(primary, "ready", transfer.id);
    expect(invoke(primary, "state").detached).toBe(false);
    invoke(chat, "ready", transfer.id);
    await opening;
    expect(chat.visible).toBe(true);
    await invoke(primary, "detach", "stale draft");
    expect(fixture.windows).toHaveLength(2);
    expect(invoke(chat, "bootstrap").snapshot).toBe("draft with image");
  });

  it("hides on close and keeps the current draft available when reopened", async () => {
    const primary = setup();
    const chat = await detach(primary);
    invoke(chat, "checkpoint", "edited draft");
    const close = { preventDefault: vi.fn() };
    chat.emit("close", close);
    expect(close.preventDefault).toHaveBeenCalled();
    expect(chat.destroyed).toBe(false);
    expect(chat.visible).toBe(false);
    invoke(primary, "focus");
    expect(chat.visible).toBe(true);
    expect(invoke(chat, "bootstrap").snapshot).toBe("edited draft");
  });

  it("toggles native visibility without discarding the detached draft", async () => {
    const primary = setup();
    const chat = await detach(primary);
    invoke(chat, "checkpoint", "unsent draft");
    invoke(primary, "toggleVisibility");
    expect(chat.visible).toBe(false);
    expect(chat.destroyed).toBe(false);
    expect(invoke(primary, "state").detached).toBe(true);
    invoke(primary, "toggleVisibility");
    expect(chat.visible).toBe(true);
    expect(invoke(chat, "bootstrap").snapshot).toBe("unsent draft");
    expect(fixture.windows).toHaveLength(2);
  });

  it("restores a minimized chat instead of hiding it", async () => {
    const primary = setup();
    const chat = await detach(primary);
    chat.minimized = true;
    invoke(primary, "toggleVisibility");
    expect(chat.minimized).toBe(false);
    expect(chat.visible).toBe(true);
  });

  it("returns the latest draft only after the main window acknowledges it", async () => {
    const primary = setup();
    const chat = await detach(primary);
    const returning = invoke(chat, "reattach", "latest draft");
    expect(chat.destroyed).toBe(false);
    const transfer = invoke(primary, "bootstrap");
    expect(transfer.snapshot).toBe("latest draft");
    invoke(primary, "ready", transfer.id);
    await returning;
    expect(chat.destroyed).toBe(true);
    expect(invoke(primary, "state").detached).toBe(false);
  });

  it("recreates a closed main window before returning chat", async () => {
    const primary = setup();
    const chat = await detach(primary);
    primary.destroy();
    expect(chat.destroyed).toBe(false);
    const returning = invoke(chat, "reattach", "latest draft");
    const replacement = fixture.windows.at(-1) as WindowStub;
    expect(replacement).not.toBe(primary);
    const transfer = invoke(replacement, "bootstrap");
    invoke(replacement, "ready", transfer.id);
    await returning;
    expect(replacement.visible).toBe(true);
  });

  it("preserves the source when the destination renderer fails", async () => {
    const primary = setup();
    const opening = invoke(primary, "detach", "preserved draft");
    const rejected = expect(opening).rejects.toThrow("renderer exited");
    const chat = fixture.windows[1] as WindowStub;
    chat.webContents.emit("render-process-gone");
    await rejected;
    expect(invoke(primary, "state")).toEqual({
      detached: false,
      transitioning: false,
    });
    expect(primary.destroyed).toBe(false);
    expect(chat.destroyed).toBe(true);
  });

  it("rejects requests from unrelated native windows", () => {
    setup();
    const unrelated = new WindowStub();
    expect(() => invoke(unrelated, "bootstrap")).toThrow("application window");
  });
});

describe("chat intent routing", () => {
  const code = {
    id: "00000000-0000-4000-8000-000000000001",
    surface: "chat",
    intent: {
      kind: "composer-input",
      input: {
        kind: "attachment",
        attachment: {
          filePath: "/work/example.ts",
          language: "typescript",
          startLine: 2,
          endLine: 3,
          startColumn: 4,
          endColumn: 10,
          selectedText: "const selected = true;",
          surroundingContext: "before and after",
        },
      },
    },
  };
  const pdf = {
    id: "00000000-0000-4000-8000-000000000002",
    surface: "chat",
    intent: {
      kind: "composer-input",
      input: { kind: "text", text: "Selected PDF paragraph" },
    },
  };
  const file = {
    id: "00000000-0000-4000-8000-000000000003",
    surface: "shell",
    intent: {
      kind: "open-file",
      filePath: "/work/example.ts",
      startLine: 2,
      endLine: 3,
    },
  };
  it("delivers chat and shell intents to the window owning each surface", async () => {
    const primary = setup();
    const chat = await detach(primary);
    chat.hide();
    invoke(chat, "dispatchIntent", file);
    invoke(primary, "dispatchIntent", code);
    invoke(primary, "dispatchIntent", pdf);
    expect(chat.visible).toBe(true);
    expect(primary.visible).toBe(true);
    expect(chat.webContents.send).toHaveBeenCalledWith(
      "chatWindow:intentAvailable",
    );
    expect(primary.webContents.send).toHaveBeenCalledWith(
      "chatWindow:intentAvailable",
    );
    expect(invoke(chat, "pendingIntents")).toEqual([code, pdf]);
    expect(invoke(primary, "pendingIntents")).toEqual([file]);
    invoke(primary, "acknowledgeIntent", code.id);
    expect(invoke(chat, "pendingIntents")).toEqual([code, pdf]);
    invoke(chat, "acknowledgeIntent", code.id);
    invoke(chat, "acknowledgeIntent", pdf.id);
    invoke(primary, "acknowledgeIntent", file.id);
    expect(invoke(chat, "pendingIntents")).toEqual([]);
    expect(invoke(primary, "pendingIntents")).toEqual([]);
  });
  it("routes show-panel and review-turn intents to the shell window", async () => {
    const primary = setup();
    const chat = await detach(primary);
    const panel = {
      id: "00000000-0000-4000-8000-000000000004",
      surface: "shell",
      intent: { kind: "show-panel", view: "git" },
    };
    const review = {
      id: "00000000-0000-4000-8000-000000000005",
      surface: "shell",
      intent: {
        kind: "review-turn",
        sessionId: "session-1",
        messageId: "message-1",
        path: "src/index.ts",
      },
    };
    invoke(chat, "dispatchIntent", panel);
    invoke(chat, "dispatchIntent", review);
    expect(invoke(primary, "pendingIntents")).toEqual([panel, review]);
    expect(() =>
      invoke(chat, "dispatchIntent", {
        ...panel,
        intent: { kind: "show-panel", view: "menu" },
      }),
    ).toThrow();
  });
  it("recreates a closed main window when a shell intent arrives", async () => {
    const primary = setup();
    const chat = await detach(primary);
    primary.destroy();
    invoke(chat, "dispatchIntent", file);
    const replacement = fixture.windows.at(-1) as WindowStub;
    expect(replacement).not.toBe(primary);
    expect(invoke(replacement, "pendingIntents")).toEqual([file]);
    expect(invoke(chat, "pendingIntents")).toEqual([]);
  });
  it("holds intents during detach and reattach until the destination is ready", async () => {
    const primary = setup();
    const opening = invoke(primary, "detach", "draft");
    const chat = fixture.windows[1] as WindowStub;
    invoke(primary, "dispatchIntent", code);
    expect(invoke(primary, "pendingIntents")).toEqual([]);
    expect(invoke(chat, "pendingIntents")).toEqual([]);
    invoke(chat, "ready", invoke(chat, "bootstrap").id);
    await opening;
    expect(invoke(chat, "pendingIntents")).toEqual([code]);
    invoke(chat, "acknowledgeIntent", code.id);
    const returning = invoke(chat, "reattach", "draft plus code");
    invoke(primary, "dispatchIntent", pdf);
    expect(invoke(chat, "pendingIntents")).toEqual([]);
    invoke(primary, "ready", invoke(primary, "bootstrap").id);
    await returning;
    expect(invoke(primary, "pendingIntents")).toEqual([pdf]);
  });
  it("keeps queued intents in the source when detaching fails", async () => {
    const primary = setup();
    const opening = invoke(primary, "detach", "draft");
    const rejected = expect(opening).rejects.toThrow("renderer exited");
    const chat = fixture.windows[1] as WindowStub;
    invoke(primary, "dispatchIntent", code);
    chat.webContents.emit("render-process-gone");
    await rejected;
    expect(invoke(primary, "pendingIntents")).toEqual([code]);
  });
  it("synchronizes browser context captured before detach and later replacements or clears", async () => {
    const primary = setup();
    const annotation = {
      id: "element",
      type: "element",
      selector: "#save",
      textContent: "Save",
      pageUrl: "https://example.test",
      regionScreenshot: "data:image/png;base64,aGVsbG8=",
      boundingBox: { x: 1, y: 2, width: 3, height: 4 },
      capturedAt: "2026-09-18",
    };
    invoke(primary, "setBrowserContext", [annotation]);
    const chat = await detach(primary);
    expect(invoke(chat, "browserContext")).toEqual([annotation]);
    invoke(primary, "setBrowserContext", []);
    expect(invoke(chat, "browserContext")).toEqual([]);
    expect(chat.webContents.send).toHaveBeenCalledWith(
      "chatWindow:browserContext",
      [],
    );
    expect(() => invoke(chat, "setBrowserContext", [annotation])).toThrow(
      "main window",
    );
  });
  it("rejects intents from unrelated windows and malformed input", () => {
    const primary = setup();
    expect(() => invoke(new WindowStub(), "dispatchIntent", code)).toThrow(
      "application window",
    );
    expect(() =>
      invoke(primary, "dispatchIntent", {
        ...code,
        intent: { kind: "execute", code: "untrusted" },
      }),
    ).toThrow();
    expect(() =>
      invoke(primary, "dispatchIntent", { ...code, surface: "menu" }),
    ).toThrow();
    expect(invoke(primary, "pendingIntents")).toEqual([]);
  });
});
