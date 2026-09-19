import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { composerDraftsAtom } from "@/features/composer/composer-draft-store";
import { chatComposerAttachmentAtom } from "@/features/editor/editor-store";
import { newSessionModesAtom } from "@/features/sessions/new-session-card/new-session-mode-draft";
import {
  focusedPaneIdAtom,
  sessionSplitLayoutAtom,
} from "@/features/sessions/session-split/session-split-store";
import {
  activeWorkspaceIdAtom,
  draftWorktreePathAtom,
} from "@/features/workspaces/workspace-store";
import {
  applyChatSnapshot,
  serializeChatSnapshot,
} from "./chat-window-snapshot";

describe("chat presentation handoff", () => {
  it("preserves workspace, selected session, unsent text and attachments", () => {
    const source = createStore();
    const target = createStore();
    source.set(activeWorkspaceIdAtom, "workspace-1");
    source.set(draftWorktreePathAtom, "/work/project/feature");
    source.set(sessionSplitLayoutAtom, {
      type: "pane",
      pane: { id: "reading", sessionId: "session-1", conversationId: null },
    });
    source.set(focusedPaneIdAtom, "reading");
    source.set(newSessionModesAtom, { "workspace-1": "plan" });
    const attachment = {
      kind: "context-folder" as const,
      folderPath: "/work/project/src",
    };
    source.set(chatComposerAttachmentAtom, attachment);
    source.set(composerDraftsAtom, {
      "session:session-1": {
        text: "Continue from here",
        nodes: [{ type: "text", value: "Continue from here" }],
        attachments: [attachment],
        mentions: [],
      },
    });
    applyChatSnapshot(target, serializeChatSnapshot(source));
    expect(target.get(activeWorkspaceIdAtom)).toBe("workspace-1");
    expect(target.get(draftWorktreePathAtom)).toBe("/work/project/feature");
    expect(target.get(sessionSplitLayoutAtom)).toEqual(
      source.get(sessionSplitLayoutAtom),
    );
    expect(target.get(focusedPaneIdAtom)).toBe("reading");
    expect(target.get(composerDraftsAtom)).toEqual(
      source.get(composerDraftsAtom),
    );
    expect(target.get(chatComposerAttachmentAtom)).toEqual(attachment);
    expect(target.get(newSessionModesAtom)).toEqual({ "workspace-1": "plan" });
  });

  it("does not resurrect a draft that was sent or cleared in the detached window", () => {
    const source = createStore();
    const target = createStore();
    source.set(composerDraftsAtom, {
      "new-session:_": {
        text: "draft",
        nodes: [{ type: "text", value: "draft" }],
        attachments: [],
        mentions: [],
      },
    });
    applyChatSnapshot(target, serializeChatSnapshot(source));
    target.set(composerDraftsAtom, {});
    target.set(chatComposerAttachmentAtom, null);
    applyChatSnapshot(source, serializeChatSnapshot(target));
    expect(source.get(composerDraftsAtom)).toEqual({});
    expect(source.get(chatComposerAttachmentAtom)).toBeNull();
  });

  it("rejects unsupported snapshots before changing the original draft", () => {
    const store = createStore();
    store.set(activeWorkspaceIdAtom, "original");
    expect(() =>
      applyChatSnapshot(store, JSON.stringify({ version: 99 })),
    ).toThrow("Invalid chat window snapshot");
    expect(store.get(activeWorkspaceIdAtom)).toBe("original");
  });
});
