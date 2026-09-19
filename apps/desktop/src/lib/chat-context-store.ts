import type {
  ContextFileAttachment,
  ContextFolderAttachment,
} from "@cocurdex/shared";
import { atom } from "jotai";

export type ChatContextInput =
  | {
      kind: "attachment";
      attachment: ContextFileAttachment | ContextFolderAttachment;
    }
  | { kind: "text"; text: string };

export interface ChatContextRequest {
  id: string;
  input: ChatContextInput;
}

export const outgoingChatContextAtom = atom<ChatContextRequest[]>([]);
export const requestChatContextAtom = atom(
  null,
  (get, set, input: ChatContextInput) => {
    set(outgoingChatContextAtom, [
      ...get(outgoingChatContextAtom),
      { id: crypto.randomUUID(), input },
    ]);
  },
);
export const removeOutgoingChatContextAtom = atom(
  null,
  (get, set, id: string) => {
    set(
      outgoingChatContextAtom,
      get(outgoingChatContextAtom).filter((request) => request.id !== id),
    );
  },
);
