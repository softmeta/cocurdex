import type { AgentProviderSnapshot, SessionRecord } from "@cocurdex/shared";
import {
  CHAT_AGENT_ID,
  CHAT_WORKSPACE_ID,
  isChatSession,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { sessionsAtom } from "@/features/sessions";

export const chatSessionsAtom = atom((get) =>
  get(sessionsAtom).filter(isChatSession),
);

export function createChatSessionRecord(input: {
  title: string;
  providerSnapshot: AgentProviderSnapshot;
  now: string;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    workspaceId: CHAT_WORKSPACE_ID,
    title: input.title,
    agentType: CHAT_AGENT_ID,
    sessionKind: "chat",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: input.now,
    updatedAt: input.now,
    lastMessageAt: null,
    archivedAt: null,
    providerSnapshot: input.providerSnapshot,
    worktreePath: null,
    peerInbound: "refuse",
  };
}
