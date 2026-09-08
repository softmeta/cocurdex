import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { createSessionMessagesAtom } from "./message-store";

export function useSessionMessages(sessionId: string | null) {
  const messagesAtom = useMemo(
    () => createSessionMessagesAtom(sessionId),
    [sessionId],
  );
  return useAtomValue(messagesAtom);
}
