import type { MessageAttachment } from "@cocurdex/shared";
import { atom } from "jotai";
import type {
  EditorContentNode,
  MentionableAttachment,
} from "./mention-editor-dom";

export interface ComposerDraft {
  attachments: MessageAttachment[];
  mentions: MentionableAttachment[];
  nodes: EditorContentNode[];
  text: string;
}

export function newSessionComposerDraftKey(
  workspaceId: string | null | undefined,
) {
  return `new-session:${workspaceId ?? "_"}`;
}

export function sessionComposerDraftKey(sessionId: string) {
  return `session:${sessionId}`;
}

export function newConversationComposerDraftKey() {
  return "new-conversation";
}

export function conversationComposerDraftKey(conversationId: string) {
  return `conversation:${conversationId}`;
}

export function isComposerDraftEmpty(draft: ComposerDraft) {
  if (draft.attachments.length > 0 || draft.mentions.length > 0) {
    return false;
  }
  return !draft.nodes.some((node) => {
    if (node.type === "mention") return true;
    return node.value.trim().length > 0;
  });
}

export const composerDraftsAtom = atom<Record<string, ComposerDraft>>({});

export const setComposerDraftAtom = atom(
  null,
  (get, set, payload: { key: string; draft: ComposerDraft }) => {
    const current = get(composerDraftsAtom);
    if (isComposerDraftEmpty(payload.draft)) {
      if (!(payload.key in current)) return;
      const { [payload.key]: _removed, ...rest } = current;
      set(composerDraftsAtom, rest);
      return;
    }
    set(composerDraftsAtom, {
      ...current,
      [payload.key]: payload.draft,
    });
  },
);

export const clearComposerDraftAtom = atom(null, (get, set, key: string) => {
  const current = get(composerDraftsAtom);
  if (!(key in current)) return;
  const { [key]: _removed, ...rest } = current;
  set(composerDraftsAtom, rest);
});
