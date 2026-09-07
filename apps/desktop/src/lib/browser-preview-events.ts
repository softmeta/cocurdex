const OPEN_HTML_PREVIEW_EVENT = "cocurdex:open-html-preview";

export async function htmlPreviewSourceId(code: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code.trimEnd()),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function openHtmlPreviewInBrowser(
  html: string,
  sourceId?: string,
  streaming = false,
) {
  const key = sourceId ?? (await htmlPreviewSourceId(html));
  return new Promise<string | null>((resolve) => {
    window.dispatchEvent(
      new CustomEvent(OPEN_HTML_PREVIEW_EVENT, {
        detail: { html, resolve, sourceId: key, streaming },
      }),
    );
  });
}

export function onOpenHtmlPreview(
  listener: (
    html: string,
    resolve: (url: string | null) => void,
    sourceId: string,
    streaming: boolean,
  ) => void,
) {
  const handleEvent = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      typeof event.detail?.html === "string" &&
      typeof event.detail?.resolve === "function"
    ) {
      listener(
        event.detail.html,
        event.detail.resolve,
        event.detail.sourceId,
        event.detail.streaming === true,
      );
    }
  };
  window.addEventListener(OPEN_HTML_PREVIEW_EVENT, handleEvent);
  return () => window.removeEventListener(OPEN_HTML_PREVIEW_EVENT, handleEvent);
}
