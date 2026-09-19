import { randomUUID } from "node:crypto";
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { z } from "zod";
import type {
  ChatWindowState,
  ChatWindowTransfer,
} from "../../src/lib/chat-window-types";
import { registerChatWindowContext } from "./chat-window-context";
import {
  type ChatWindowFactoryOptions,
  createChatWindow,
  loadChatWindow,
} from "./chat-window-factory";
import { ChatWindowHandoff } from "./chat-window-transfer";

const snapshotSchema = z
  .string()
  .min(1)
  .max(16 * 1024 * 1024);

export function registerChatWindowHandlers(
  options: ChatWindowFactoryOptions & { createPrimaryWindow(): BrowserWindow },
) {
  let primary: BrowserWindow | null = null;
  let chat: BrowserWindow | null = null;
  let detached = false;
  let quitting = false;
  let checkpoint: ChatWindowTransfer | null = null;
  const handoff = new ChatWindowHandoff();

  const state = (): ChatWindowState => ({
    detached,
    transitioning: handoff.busy,
  });
  const publish = () => {
    context.publish();
    for (const window of [primary, chat]) {
      if (window && !window.isDestroyed()) {
        window.webContents.send("chatWindow:state", state());
      }
    }
  };
  const sender = (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      window.isDestroyed() ||
      (window !== primary && window !== chat)
    ) {
      throw new Error("Chat window request requires an application window");
    }
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Chat window request requires the main frame");
    }
    return window;
  };
  const focus = (window: BrowserWindow) => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const context = registerChatWindowContext({
    sender,
    owner: () => (handoff.busy ? null : detached ? chat : primary),
    primary: () => primary,
    focus,
  });
  const setPrimaryWindow = (window: BrowserWindow) => {
    primary = window;
    window.on("closed", () => {
      if (handoff.forTarget(window.id)) {
        handoff.cancel(new Error("The main window was closed during transfer"));
      }
      if (primary === window) primary = null;
    });
  };

  app.on("before-quit", () => {
    quitting = true;
  });

  ipcMain.handle("chatWindow:state", (event) => {
    sender(event);
    return state();
  });
  ipcMain.handle("chatWindow:bootstrap", (event) => {
    const window = sender(event);
    return (
      handoff.forTarget(window.id) ?? (window === chat ? checkpoint : null)
    );
  });
  ipcMain.handle("chatWindow:checkpoint", (event, snapshot: unknown) => {
    if (sender(event) !== chat || !detached || handoff.busy) return;
    checkpoint = { id: randomUUID(), snapshot: snapshotSchema.parse(snapshot) };
  });
  ipcMain.handle("chatWindow:focus", (event) => {
    sender(event);
    if (chat && detached) focus(chat);
  });
  ipcMain.handle("chatWindow:toggleVisibility", (event) => {
    const owner = sender(event);
    if (!chat || !detached || handoff.busy) return;
    if (chat.isVisible() && !chat.isMinimized()) {
      chat.hide();
      if (owner !== chat) focus(owner);
      return;
    }
    focus(chat);
  });
  ipcMain.handle("chatWindow:ready", (event, id: unknown) => {
    const window = sender(event);
    if (!handoff.complete(window.id, z.string().parse(id))) return;
    detached = window === chat;
    if (!detached) {
      const previous = chat;
      chat = null;
      checkpoint = null;
      previous?.destroy();
    }
    focus(window);
    publish();
  });
  ipcMain.handle("chatWindow:detach", async (event, value: unknown) => {
    const owner = sender(event);
    if (owner !== primary)
      throw new Error("Only the main window can detach chat");
    if (handoff.busy)
      throw new Error("A chat window transfer is already in progress");
    if (chat && detached) {
      focus(chat);
      return;
    }
    const snapshot = snapshotSchema.parse(value);
    const target = createChatWindow(options, owner);
    chat = target;
    const transaction = handoff.begin(target.id, snapshot);
    checkpoint = transaction.transfer;
    target.on("close", (closeEvent) => {
      if (quitting) return;
      closeEvent.preventDefault();
      target.hide();
    });
    target.on("closed", () => {
      if (chat !== target) return;
      chat = null;
      detached = false;
      handoff.cancel(new Error("The chat window was closed during transfer"));
      publish();
    });
    target.webContents.on("render-process-gone", () => {
      handoff.cancel(new Error("The chat renderer exited during transfer"));
      if (detached && !quitting) target.webContents.reload();
    });
    publish();
    void loadChatWindow(target, options).catch((error: unknown) => {
      handoff.cancel(error instanceof Error ? error : new Error(String(error)));
    });
    try {
      await transaction.completion;
    } catch (error) {
      chat = null;
      checkpoint = null;
      if (!target.isDestroyed()) target.destroy();
      throw error;
    } finally {
      publish();
    }
  });
  ipcMain.handle("chatWindow:reattach", async (event, value: unknown) => {
    if (sender(event) !== chat || !detached) {
      throw new Error("Only the detached chat window can return chat");
    }
    const snapshot = snapshotSchema.parse(value);
    if (handoff.busy)
      throw new Error("A chat window transfer is already in progress");
    if (!primary || primary.isDestroyed()) {
      primary = options.createPrimaryWindow();
    }
    const target = primary;
    if (!target) throw new Error("The main window is unavailable");
    const transaction = handoff.begin(target.id, snapshot);
    publish();
    target.webContents.send("chatWindow:transfer", transaction.transfer);
    try {
      await transaction.completion;
    } finally {
      publish();
    }
  });
  return { setPrimaryWindow };
}
