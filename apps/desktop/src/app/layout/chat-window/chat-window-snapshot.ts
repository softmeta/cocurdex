import type { getDefaultStore } from "jotai";
import { bootstrapQueuedInputsAtom } from "@/features/agent";
import {
  conversationsAtom,
  loadConversationMessagesAtom,
} from "@/features/chat";
import {
  bootstrapSessionUsageAtom,
  composerDraftsAtom,
} from "@/features/composer";
import { chatComposerAttachmentAtom } from "@/features/editor";
import {
  agentsAtom,
  bootstrapProviderModelsAtom,
  focusedPaneIdAtom,
  lastSelectedAgentAtom,
  listPanes,
  newSessionModesAtom,
  sessionSplitLayoutAtom,
  sessionsAtom,
} from "@/features/sessions";
import {
  activeWorkspaceIdAtom,
  draftWorktreePathAtom,
  lastSelectedWorkspaceIdAtom,
  workspacesAtom,
} from "@/features/workspaces";
import { desktopApi } from "@/lib";
import {
  captureChatReadingPositions,
  setChatReadingPositions,
} from "@/lib/chat-reading-position";
import { sidebarTabAtom } from "../sidebar/sidebar-tab-store";

type Store = ReturnType<typeof getDefaultStore>;

function captureSnapshot(store: Store) {
  return {
    version: 1,
    workspaceId: store.get(activeWorkspaceIdAtom),
    lastWorkspaceId: store.get(lastSelectedWorkspaceIdAtom),
    worktreePath: store.get(draftWorktreePathAtom),
    agent: store.get(lastSelectedAgentAtom),
    agents: store.get(agentsAtom),
    sidebarTab: store.get(sidebarTabAtom),
    layout: store.get(sessionSplitLayoutAtom),
    focusedPaneId: store.get(focusedPaneIdAtom),
    drafts: store.get(composerDraftsAtom),
    attachment: store.get(chatComposerAttachmentAtom),
    sessionModes: store.get(newSessionModesAtom),
    readingPositions: captureChatReadingPositions(),
  };
}

export function serializeChatSnapshot(store: Store) {
  return JSON.stringify(captureSnapshot(store));
}

export function applyChatSnapshot(store: Store, payload: string) {
  const snapshot = JSON.parse(payload) as ReturnType<typeof captureSnapshot>;
  if (
    snapshot.version !== 1 ||
    !snapshot.layout ||
    !snapshot.drafts ||
    !Array.isArray(snapshot.agents)
  ) {
    throw new Error("Invalid chat window snapshot");
  }
  store.set(agentsAtom, snapshot.agents);
  store.set(activeWorkspaceIdAtom, snapshot.workspaceId);
  store.set(lastSelectedWorkspaceIdAtom, snapshot.lastWorkspaceId);
  store.set(draftWorktreePathAtom, snapshot.worktreePath);
  store.set(lastSelectedAgentAtom, snapshot.agent);
  store.set(sidebarTabAtom, snapshot.sidebarTab);
  store.set(composerDraftsAtom, snapshot.drafts);
  store.set(chatComposerAttachmentAtom, snapshot.attachment);
  store.set(newSessionModesAtom, snapshot.sessionModes);
  store.set(sessionSplitLayoutAtom, snapshot.layout);
  store.set(focusedPaneIdAtom, snapshot.focusedPaneId);
  setChatReadingPositions(snapshot.readingPositions);
}

export async function hydrateChatWindow(
  store: Store,
  payload: string,
  synchronize: (ids: string[]) => Promise<void>,
) {
  const context = JSON.parse(payload) as ReturnType<typeof captureSnapshot>;
  const panes = listPanes(context.layout);
  const [data, conversations] = await Promise.all([
    desktopApi.bootstrapApp(),
    desktopApi.chatList(),
  ]);
  store.set(workspacesAtom, data.workspaces);
  store.set(sessionsAtom, data.sessions);
  store.set(conversationsAtom, conversations);
  store.set(bootstrapQueuedInputsAtom, {
    inputs: data.queuedAgentInputs,
    messages: data.queuedMessages,
  });
  store.set(bootstrapSessionUsageAtom, data.sessionUsage);
  await Promise.all([
    synchronize(
      panes.flatMap((pane) => (pane.sessionId ? [pane.sessionId] : [])),
    ),
    store.set(bootstrapProviderModelsAtom),
    ...panes.flatMap((pane) =>
      pane.conversationId
        ? [store.set(loadConversationMessagesAtom, pane.conversationId)]
        : [],
    ),
  ]);
}
