import { randomUUID } from "node:crypto";
import type { BrowserAnnotation } from "@cocurdex/shared";
import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { z } from "zod";
import type {
  ChatWindowIntentRequest,
  ChatWindowSurface,
} from "../../src/lib/chat-window-types";

const text = z.string().max(8 * 1024 * 1024);
const attachment = z.union([
  z.object({
    kind: z.literal("context-folder"),
    folderPath: text,
  }),
  z.object({
    kind: z.literal("context-file").optional(),
    filePath: text,
    language: text,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startColumn: z.number().int().positive().optional(),
    endColumn: z.number().int().positive().optional(),
    selectedText: text,
    surroundingContext: text,
    contentOmitted: z.boolean().optional(),
  }),
]);
const composerInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attachment"), attachment }),
  z.object({ kind: z.literal("text"), text }),
]);
const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("composer-input"), input: composerInput }),
  z.object({
    kind: z.literal("open-file"),
    filePath: text,
    startLine: z.number().int().positive().nullish(),
    endLine: z.number().int().positive().nullish(),
  }),
  z.object({
    kind: z.literal("show-panel"),
    view: z.enum([
      "editor",
      "notes",
      "issues",
      "git",
      "browser",
      "pdf",
      "terminal",
    ]),
  }),
  z.object({
    kind: z.literal("review-turn"),
    sessionId: text,
    messageId: text,
    path: text,
  }),
]);
const dispatchSchema = z.object({
  id: z.string().uuid().optional(),
  surface: z.enum(["shell", "chat"]),
  intent: intentSchema,
});
const annotationsSchema = z.array(
  z.object({
    id: text,
    type: z.enum(["element", "region"]),
    selector: text.optional(),
    tagName: text.optional(),
    textContent: text.optional(),
    boundingBox: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    regionScreenshot: text.optional(),
    pageUrl: text,
    note: text.optional(),
    capturedAt: text,
  }),
);

export function registerChatWindowContext({
  sender,
  owner,
  primary,
  ensurePrimary,
  focus,
}: {
  sender(event: IpcMainInvokeEvent): BrowserWindow;
  owner(): BrowserWindow | null;
  primary(): BrowserWindow | null;
  ensurePrimary(): BrowserWindow;
  focus(window: BrowserWindow): void;
}) {
  const pending = new Map<string, ChatWindowIntentRequest>();
  let annotations: BrowserAnnotation[] = [];
  // Resolve a logical surface to the window currently hosting it. Returns null
  // while a surface has no live window (mid-handoff), leaving intents queued
  // until ownership settles.
  const surfaceWindow = (surface: ChatWindowSurface) =>
    surface === "chat" ? owner() : primary();
  const publish = () => {
    const ownerWindow = owner();
    if (
      ownerWindow &&
      !ownerWindow.isDestroyed() &&
      ownerWindow !== primary()
    ) {
      ownerWindow.webContents.send("chatWindow:browserContext", annotations);
    }
    const notified = new Set<BrowserWindow>();
    for (const request of pending.values()) {
      const target = surfaceWindow(request.surface);
      if (!target || target.isDestroyed() || notified.has(target)) continue;
      notified.add(target);
      focus(target);
      target.webContents.send("chatWindow:intentAvailable");
    }
  };
  ipcMain.handle("chatWindow:dispatchIntent", (event, value: unknown) => {
    sender(event);
    const parsed = dispatchSchema.parse(value);
    // A shell intent implies the user wants the workspace surface back — bring
    // the primary window up rather than queueing behind a destroyed one.
    if (parsed.surface === "shell") ensurePrimary();
    const id = parsed.id ?? randomUUID();
    pending.set(id, { id, surface: parsed.surface, intent: parsed.intent });
    publish();
  });
  ipcMain.handle("chatWindow:pendingIntents", (event) => {
    const window = sender(event);
    return [...pending.values()].filter(
      (request) => surfaceWindow(request.surface) === window,
    );
  });
  ipcMain.handle("chatWindow:acknowledgeIntent", (event, id: unknown) => {
    const window = sender(event);
    const request = pending.get(z.string().uuid().parse(id));
    if (request && surfaceWindow(request.surface) === window) {
      pending.delete(request.id);
    }
  });
  ipcMain.handle("chatWindow:setBrowserContext", (event, value: unknown) => {
    if (sender(event) !== primary())
      throw new Error("Only the main window owns browser context");
    annotations = annotationsSchema.parse(value);
    const target = owner();
    if (target && target !== primary()) {
      target.webContents.send("chatWindow:browserContext", annotations);
    }
  });
  ipcMain.handle("chatWindow:browserContext", (event) => {
    sender(event);
    return annotations;
  });
  return { publish };
}
