import type { Session } from "electron";
import { HTML_PREVIEW_SCHEME, HtmlPreviewStore } from "./html-preview-store";

export const browserHtmlPreviews = new HtmlPreviewStore();
const registeredSessions = new WeakSet<Session>();

export function registerBrowserHtmlProtocol(session: Session) {
  if (registeredSessions.has(session)) {
    return;
  }

  session.protocol.handle(HTML_PREVIEW_SCHEME, (request) => {
    const html = browserHtmlPreviews.read(request.url);
    if (html === undefined) {
      return new Response("HTML preview not found", { status: 404 });
    }
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": [
          "sandbox allow-scripts",
          "default-src 'none'",
          "script-src 'unsafe-inline'",
          "style-src 'unsafe-inline'",
          "img-src data: blob:",
          "font-src data:",
          "base-uri 'none'",
          "form-action 'none'",
        ].join("; "),
      },
    });
  });
  registeredSessions.add(session);
}
