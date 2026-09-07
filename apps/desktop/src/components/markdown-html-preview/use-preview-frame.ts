import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createHtmlPreviewDocument } from "./preview-document";

export function usePreviewFrame(code: string, isIncomplete: boolean) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [nonce] = useState(() => crypto.randomUUID());
  const streamedFrame = useRef<HTMLIFrameElement | null>(null);
  const completedCode = isIncomplete ? null : code;
  const updateDocument = useEffectEvent(() => {
    if (!frame) {
      return;
    }

    streamedFrame.current = frame;
    const document = createHtmlPreviewDocument(code, isIncomplete, { nonce });
    if (frame.srcdoc !== document) {
      frame.srcdoc = document;
    }
  });

  useEffect(() => {
    if (!frame) {
      return;
    }
    if (completedCode !== null) {
      const document = createHtmlPreviewDocument(completedCode, false, {
        nonce,
        scrollToEnd: streamedFrame.current === frame,
      });
      if (frame.srcdoc !== document) {
        frame.srcdoc = document;
      }
      return;
    }

    updateDocument();
    const timer = window.setInterval(updateDocument, 250);
    return () => window.clearInterval(timer);
  }, [frame, completedCode, nonce]);

  return setFrame;
}
