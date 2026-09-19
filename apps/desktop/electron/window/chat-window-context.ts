import type { BrowserAnnotation } from "@cocurdex/shared";
import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { z } from "zod";
import type { ChatContextRequest } from "../../src/lib/chat-context-store";

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
const requestSchema = z.object({
  id: z.string().uuid(),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("attachment"), attachment }),
    z.object({ kind: z.literal("text"), text }),
  ]),
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
  focus,
}: {
  sender(event: IpcMainInvokeEvent): BrowserWindow;
  owner(): BrowserWindow | null;
  primary(): BrowserWindow | null;
  focus(window: BrowserWindow): void;
}) {
  const pending = new Map<string, ChatContextRequest>();
  let annotations: BrowserAnnotation[] = [];
  const publish = () => {
    const target = owner();
    if (!target || target.isDestroyed()) return;
    if (target !== primary())
      target.webContents.send("chatWindow:browserContext", annotations);
    if (pending.size === 0) return;
    focus(target);
    target.webContents.send("chatWindow:contextAvailable");
  };
  ipcMain.handle("chatWindow:addContext", (event, value: unknown) => {
    sender(event);
    const request = requestSchema.parse(value);
    pending.set(request.id, request);
    publish();
  });
  ipcMain.handle("chatWindow:pendingContext", (event) => {
    if (sender(event) !== owner()) return [];
    return [...pending.values()];
  });
  ipcMain.handle("chatWindow:acknowledgeContext", (event, id: unknown) => {
    if (sender(event) !== owner()) return;
    pending.delete(z.string().parse(id));
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
