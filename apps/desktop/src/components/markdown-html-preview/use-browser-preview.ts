import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  desktopApi,
  htmlPreviewSourceId,
  openHtmlPreviewInBrowser,
} from "@/lib";
import { createBrowserPreviewStream } from "./browser-preview-stream";
import { createHtmlPreviewDocument } from "./preview-document";

export function useBrowserPreview(
  code: string,
  isIncomplete: boolean,
  enabled: boolean,
) {
  const stream = useRef<ReturnType<typeof createBrowserPreviewStream> | null>(
    null,
  );
  const [nonce] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const completedCode = isIncomplete ? null : code;
  const update = useEffectEvent(() => {
    if (!stream.current && isIncomplete) {
      stream.current = createBrowserPreviewStream({
        open: (html, streaming) =>
          openHtmlPreviewInBrowser(html, nonce, streaming),
        update: async (url, html, streaming, source) =>
          desktopApi.browserUpdateHtml(
            url,
            html,
            await htmlPreviewSourceId(source),
            streaming,
          ),
        onError: (cause) =>
          setError(cause instanceof Error ? cause.message : String(cause)),
      });
    }
    stream.current?.push(
      createHtmlPreviewDocument(code, isIncomplete, {
        nonce,
        scrollToEnd: false,
      }),
      isIncomplete,
      code,
    );
  });

  useEffect(() => {
    if (!enabled) return;
    return () => {
      stream.current?.stop();
      stream.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isIncomplete) return;
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [enabled, isIncomplete]);

  useEffect(() => {
    if (enabled && completedCode !== null) update();
  }, [enabled, completedCode]);

  return error;
}
