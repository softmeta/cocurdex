import type { Session } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  browserHtmlPreviews,
  registerBrowserHtmlProtocol,
} from "./html-preview-protocol";

describe("HTML preview protocol", () => {
  it("serves HTML with a non-overridable sandbox policy in the browser session", async () => {
    const handle = vi.fn<Session["protocol"]["handle"]>();
    const session = { protocol: { handle } } as unknown as Session;
    registerBrowserHtmlProtocol(session);
    const handler = handle.mock.calls[0][1];
    const html =
      '<meta http-equiv="Content-Security-Policy" content="default-src *"><h1>你好</h1>';
    const url = browserHtmlPreviews.add(html);
    const response = await handler(new Request(url));

    expect(await response.text()).toBe(html);
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).not.toContain("allow-same-origin");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'unsafe-inline'");
    expect((await handler(new Request(`${url}/missing`))).status).toBe(404);
  });
});
