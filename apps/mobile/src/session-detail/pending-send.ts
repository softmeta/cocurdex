import type { ImageAttachment, MessageRecord } from "@cocurdex/shared";
import type { TranscriptItem } from "./transcript";

export interface PendingSend {
  id: string;
  text: string;
  images: ImageAttachment[];
}

export function unconfirmedSends(
  sends: readonly PendingSend[],
  messages: readonly MessageRecord[],
  activeMessages: readonly MessageRecord[],
): readonly PendingSend[] {
  if (sends.length === 0) return sends;
  const known = new Set([...messages, ...activeMessages].map((m) => m.id));
  return sends.filter((send) => !known.has(send.id));
}

export function pendingSendItem(send: PendingSend): TranscriptItem {
  return { kind: "user", id: send.id, text: send.text, images: send.images };
}
