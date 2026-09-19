import { isContextAttachment, type MessageAttachment } from "@cocurdex/shared";
import { atom } from "jotai";
import { requestChatContextAtom } from "@/lib/chat-context-store";

export const editorSelectionAttachmentAtom = atom<MessageAttachment | null>(
  null,
);
export const chatComposerAttachmentAtom = atom<MessageAttachment | null>(null);
export const setEditorSelectionAttachmentAtom = atom(
  null,
  (_get, set, attachment: MessageAttachment | null) => {
    set(editorSelectionAttachmentAtom, attachment);
  },
);
export const setChatComposerAttachmentAtom = atom(
  null,
  (_get, set, attachment: MessageAttachment | null) => {
    if (attachment && isContextAttachment(attachment)) {
      set(requestChatContextAtom, { kind: "attachment", attachment });
      return;
    }
    set(chatComposerAttachmentAtom, attachment);
  },
);
export const attachEditorSelectionToChatAtom = atom(null, (get, set) => {
  const attachment = get(editorSelectionAttachmentAtom);
  if (attachment) set(setChatComposerAttachmentAtom, attachment);
});
export const clearChatComposerAttachmentAtom = atom(null, (_get, set) => {
  set(chatComposerAttachmentAtom, null);
});
