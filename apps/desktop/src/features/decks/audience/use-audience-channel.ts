import type { DeckContent } from "@cocurdex/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudienceMessage,
  audienceChannelName,
  type PresenterMessage,
} from "./audience-channel";

interface AudienceState {
  content: DeckContent;
  index: number;
}

export function useAudienceChannel(channel: string) {
  const [state, setState] = useState<AudienceState | null>(null);
  const portRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const port = new BroadcastChannel(audienceChannelName(channel));
    portRef.current = port;
    const send = (message: AudienceMessage) => port.postMessage(message);
    port.onmessage = (event: MessageEvent<PresenterMessage>) => {
      const message = event.data;
      if (message.type === "end") {
        window.close();
        return;
      }
      setState({ content: message.content, index: message.index });
    };
    const announceClose = () => send({ type: "closed" });
    window.addEventListener("pagehide", announceClose);
    send({ type: "ready" });
    return () => {
      window.removeEventListener("pagehide", announceClose);
      port.close();
      portRef.current = null;
    };
  }, [channel]);

  const navigate = useCallback((index: number) => {
    setState((current) => (current ? { ...current, index } : current));
    portRef.current?.postMessage({
      type: "navigate",
      index,
    } satisfies AudienceMessage);
  }, []);

  const close = useCallback(() => {
    portRef.current?.postMessage({ type: "closed" } satisfies AudienceMessage);
    window.close();
  }, []);

  return { state, navigate, close };
}
