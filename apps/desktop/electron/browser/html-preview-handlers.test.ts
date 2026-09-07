import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  browserNavigationSchema,
  registerBrowserHtmlHandlers,
} from "./html-preview-handlers";

const { open, update } = vi.hoisted(() => ({
  open: vi
    .fn()
    .mockResolvedValue(
      "cocurdex-html://preview/00000000-0000-4000-8000-000000000000",
    ),
  update: vi.fn().mockResolvedValue(true),
}));
vi.mock("./browser-tabs", () => ({
  openBrowserHtml: open,
  updateBrowserHtml: update,
}));

describe("HTML preview IPC", () => {
  it("requires a source identity and validates HTML and navigation protocols", async () => {
    const handle = vi.fn<IpcMain["handle"]>();
    registerBrowserHtmlHandlers({ handle } as unknown as IpcMain);
    const listener = handle.mock.calls.find(
      ([channel]) => channel === "browser:openHtml",
    )?.[1];
    if (!listener) throw new Error("Missing open handler");
    const payload = {
      html: "<h1>Preview</h1>",
      sourceId: "document",
      streaming: false,
    };
    const url = await listener({} as IpcMainInvokeEvent, payload);
    expect(open).toHaveBeenCalledWith(payload.html, payload.sourceId, false);
    expect(browserNavigationSchema.safeParse(url).success).toBe(true);
    expect(
      browserNavigationSchema.safeParse("https://example.com").success,
    ).toBe(true);
    for (const unsafe of [
      "file:///etc/passwd",
      "data:text/html,hello",
      "javascript:alert(1)",
    ]) {
      expect(browserNavigationSchema.safeParse(unsafe).success).toBe(false);
    }
    for (const invalid of [
      { html: "hello" },
      { ...payload, html: "" },
      { ...payload, html: "x".repeat(2_000_001) },
    ]) {
      await expect(listener({} as IpcMainInvokeEvent, invalid)).rejects.toThrow(
        "Invalid payload",
      );
    }
  });

  it("routes background updates by preview URL with a stable content identity", async () => {
    const handle = vi.fn<IpcMain["handle"]>();
    registerBrowserHtmlHandlers({ handle } as unknown as IpcMain);
    const listener = handle.mock.calls.find(
      ([channel]) => channel === "browser:updateHtml",
    )?.[1];
    if (!listener) throw new Error("Missing update handler");
    const payload = {
      url: "cocurdex-html://preview/00000000-0000-4000-8000-000000000000",
      html: "<p>Final</p>",
      contentKey: "final",
      streaming: false,
    };
    expect(await listener({} as IpcMainInvokeEvent, payload)).toBe(true);
    expect(update).toHaveBeenCalledWith(
      payload.url,
      payload.html,
      payload.contentKey,
      false,
    );
  });
});
