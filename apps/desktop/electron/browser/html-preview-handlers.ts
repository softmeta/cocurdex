import type { IpcMain } from "electron";
import { z } from "zod";
import { registerHandler, schemas } from "../ipc";
import { openBrowserHtml, updateBrowserHtml } from "./browser-tabs";
import { HTML_PREVIEW_URL_PATTERN } from "./html-preview-store";

export const browserNavigationSchema = schemas.url.or(
  z.string().max(4096).regex(HTML_PREVIEW_URL_PATTERN),
);

export function registerBrowserHtmlHandlers(ipc: IpcMain) {
  registerHandler(
    ipc,
    "browser:updateHtml",
    z.object({
      url: z.string().regex(HTML_PREVIEW_URL_PATTERN),
      html: z.string().min(1).max(2_000_000),
      contentKey: z.string().min(1).max(4096),
      streaming: z.boolean(),
    }),
    async (_event, { url, html, contentKey, streaming }) =>
      updateBrowserHtml(url, html, contentKey, streaming),
  );
  registerHandler(
    ipc,
    "browser:openHtml",
    z.object({
      html: z.string().min(1).max(2_000_000),
      sourceId: z.string().min(1).max(4096),
      streaming: z.boolean(),
    }),
    async (_event, { html, sourceId, streaming }) =>
      openBrowserHtml(html, sourceId, streaming),
  );
}
