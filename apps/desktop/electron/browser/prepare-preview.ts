import type { WebContentsView } from "electron";
import { previewScrollPosition, updatePreviewDom } from "./preview-dom";

export async function preparePreview(
  view: WebContentsView,
  current: WebContentsView,
  url: string,
  signal: AbortSignal,
  html: string,
  configure: () => Promise<void>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("Preview preparation cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => reject(new Error("Preview preparation timed out")),
      8000,
    );
    if (signal.aborted) abort();
  });
  const prepare = async () => {
    signal.throwIfAborted();
    await current.webContents.executeJavaScriptInIsolatedWorld(1001, [
      {
        code: `(${updatePreviewDom.toString()})(${JSON.stringify(html)})`,
      },
    ]);
    signal.throwIfAborted();
    await view.webContents.loadURL(url);
    signal.throwIfAborted();
    await configure();
    signal.throwIfAborted();
    await view.webContents.executeJavaScriptInIsolatedWorld(1001, [
      {
        code: "Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 250))]).then(() => true)",
      },
    ]);
    signal.throwIfAborted();
    const scroll = await current.webContents.executeJavaScriptInIsolatedWorld(
      1001,
      [
        {
          code: `(${previewScrollPosition.toString()})()`,
        },
      ],
    );
    signal.throwIfAborted();
    if (scroll)
      await view.webContents.executeJavaScriptInIsolatedWorld(1001, [
        {
          code: `window.scrollTo({top: ${scroll.follow ? "document.documentElement.scrollHeight" : Number(scroll.top)}, behavior: "instant"})`,
        },
      ]);
    signal.throwIfAborted();
    await view.webContents.capturePage(undefined, {
      stayHidden: true,
      stayAwake: true,
    });
    signal.throwIfAborted();
  };
  try {
    await Promise.race([prepare(), interrupted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
