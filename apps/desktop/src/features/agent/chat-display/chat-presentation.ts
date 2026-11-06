import type { AgentRoleRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { createContext, useContext } from "react";
import { chatDisplaySettingsAtom } from "./chat-display-store";
import type { ActivityDisplayMode } from "./chat-display-types";

export type ChatPresentation = "work" | "assistant";

export const ChatPresentationContext = createContext<ChatPresentation>("work");

export function useChatPresentation(): ChatPresentation {
  return useContext(ChatPresentationContext);
}

export const ChatAssistantRoleContext = createContext<AgentRoleRecord | null>(
  null,
);

export function useChatAssistantRole(): AgentRoleRecord | null {
  return useContext(ChatAssistantRoleContext);
}

export function useActivityDisplay(): ActivityDisplayMode {
  const presentation = useChatPresentation();
  const { activityDisplay } = useAtomValue(chatDisplaySettingsAtom);
  return presentation === "assistant" ? "hidden" : activityDisplay;
}
