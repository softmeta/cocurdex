import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
  type ComposerDraft,
  clearComposerDraftAtom,
  composerDraftsAtom,
  conversationComposerDraftKey,
  isComposerDraftEmpty,
  newConversationComposerDraftKey,
  newSessionComposerDraftKey,
  sessionComposerDraftKey,
  setComposerDraftAtom,
} from "@/features/composer/composer-draft-store";

function textDraft(text: string): ComposerDraft {
  return {
    attachments: [],
    mentions: [],
    nodes: text.length > 0 ? [{ type: "text", value: text }] : [],
    text,
  };
}

describe("composer draft keys", () => {
  it("namespaces new-session drafts by workspace", () => {
    expect(newSessionComposerDraftKey("ws-1")).toBe("new-session:ws-1");
    expect(newSessionComposerDraftKey(null)).toBe("new-session:_");
  });

  it("keeps session, conversation, and new-conversation keys distinct", () => {
    expect(sessionComposerDraftKey("s1")).toBe("session:s1");
    expect(conversationComposerDraftKey("c1")).toBe("conversation:c1");
    expect(newConversationComposerDraftKey()).toBe("new-conversation");
  });
});

describe("isComposerDraftEmpty", () => {
  it("treats whitespace-only text as empty", () => {
    expect(isComposerDraftEmpty(textDraft("  \n"))).toBe(true);
  });

  it("keeps mention or attachment drafts", () => {
    expect(
      isComposerDraftEmpty({
        attachments: [],
        mentions: [
          {
            kind: "context-folder",
            folderPath: "/ws/src",
          },
        ],
        nodes: [
          {
            displayLabel: "src",
            key: "folder:/ws/src",
            serializedText: "@src",
            type: "mention",
          },
        ],
        text: "@src",
      }),
    ).toBe(false);
    expect(
      isComposerDraftEmpty({
        attachments: [
          {
            filePath: "/tmp/a.png",
            height: 10,
            id: "img-1",
            kind: "image",
            mimeType: "image/png",
            name: "a.png",
            sizeBytes: 12,
            width: 10,
          },
        ],
        mentions: [],
        nodes: [],
        text: "",
      }),
    ).toBe(false);
  });
});

describe("composer draft store", () => {
  it("restores a draft after it is replaced by another key", () => {
    const store = createStore();
    const newSessionKey = newSessionComposerDraftKey("ws-1");
    const sessionKey = sessionComposerDraftKey("s1");

    store.set(setComposerDraftAtom, {
      draft: textDraft("unsent new session"),
      key: newSessionKey,
    });
    store.set(setComposerDraftAtom, {
      draft: textDraft("follow-up"),
      key: sessionKey,
    });

    expect(store.get(composerDraftsAtom)[newSessionKey]?.text).toBe(
      "unsent new session",
    );
    expect(store.get(composerDraftsAtom)[sessionKey]?.text).toBe("follow-up");
  });

  it("drops empty drafts so a sent composer does not come back filled", () => {
    const store = createStore();
    const key = newSessionComposerDraftKey("ws-1");

    store.set(setComposerDraftAtom, {
      draft: textDraft("hello"),
      key,
    });
    store.set(setComposerDraftAtom, {
      draft: textDraft(""),
      key,
    });

    expect(store.get(composerDraftsAtom)[key]).toBeUndefined();
  });

  it("clears one key without touching others", () => {
    const store = createStore();
    const keep = sessionComposerDraftKey("keep");
    const drop = sessionComposerDraftKey("drop");

    store.set(setComposerDraftAtom, { draft: textDraft("keep me"), key: keep });
    store.set(setComposerDraftAtom, { draft: textDraft("drop me"), key: drop });
    store.set(clearComposerDraftAtom, drop);

    expect(store.get(composerDraftsAtom)[keep]?.text).toBe("keep me");
    expect(store.get(composerDraftsAtom)[drop]).toBeUndefined();
  });
});
