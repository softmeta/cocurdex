import { useEffectEvent } from "react";
import {
  type ChatReadingPosition,
  registerChatReader,
  takeChatReadingPosition,
} from "./chat-reading-position";
import { useMountEffect } from "./react-hooks";

export function useChatReadingPosition(
  key: string,
  read: () => ChatReadingPosition | null,
  restore: (position: ChatReadingPosition) => boolean,
) {
  const readCurrent = useEffectEvent(read);
  const restoreCurrent = useEffectEvent(restore);
  useMountEffect(() => {
    const unregister = registerChatReader(key, readCurrent);
    const position = takeChatReadingPosition(key);
    let frame = 0;
    let attempts = 0;
    const apply = () => {
      if (!position || position.atBottom || restoreCurrent(position)) return;
      if (++attempts < 600) frame = requestAnimationFrame(apply);
    };
    frame = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(frame);
      unregister();
    };
  });
}
