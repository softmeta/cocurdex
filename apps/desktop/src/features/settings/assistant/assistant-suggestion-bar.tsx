import { isAssistantSessionId } from "@cocurdex/shared";

import { useAtomValue, useSetAtom } from "jotai";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import { Button } from "@/components/ui";
import {
  messagesLoadedBySessionAtom,
  useSessionMessages,
} from "@/features/agent";
import { focusedSessionPaneAtom, sessionsAtom } from "@/features/sessions";
import { workspacesAtom } from "@/features/workspaces";
import { newAssistantSessionAtom } from "./assistant-actions";
import { sendAssistantMessageAtom } from "./assistant-send";

const ASSISTANT_SUGGESTIONS = {
  chatDisplay: {
    labelKey: "assistant.suggestions.chatDisplay",
    promptKey: "assistant.prompts.chatDisplay",
  },
  explore: {
    labelKey: "assistant.suggestions.explore",
    promptKey: "assistant.prompts.explore",
  },
  language: {
    labelKey: "assistant.suggestions.language",
    promptKey: "assistant.prompts.language",
  },
  notifications: {
    labelKey: "assistant.suggestions.notifications",
    promptKey: "assistant.prompts.notifications",
  },
  theme: {
    labelKey: "assistant.suggestions.theme",
    promptKey: "assistant.prompts.theme",
  },
  worktree: {
    labelKey: "assistant.suggestions.worktree",
    promptKey: "assistant.worktreeKickoff",
  },
} as const;

const SECTION_SUGGESTIONS: Partial<
  Record<SettingsSectionId, readonly (keyof typeof ASSISTANT_SUGGESTIONS)[]>
> = {
  appearance: ["theme", "explore"],
  general: ["language", "notifications", "explore"],
  personalization: ["chatDisplay", "explore"],
  projects: ["worktree", "explore"],
  worktrees: ["worktree", "explore"],
};

// Sits above the chat dock content on the settings screen. Offers section-aware
// prompts while the assistant session is fresh, plus a way to start a new
// assistant session instead of continuing the current one.
export function AssistantSuggestionBar({
  section,
}: {
  section: SettingsSectionId;
}) {
  const { t } = useTranslation("settings");
  const focusedPane = useAtomValue(focusedSessionPaneAtom);
  const sessionId = focusedPane?.sessionId ?? null;
  const messages = useSessionMessages(sessionId);
  const messagesLoaded = useAtomValue(messagesLoadedBySessionAtom);
  const session = useAtomValue(sessionsAtom).find(
    (entry) => entry.id === sessionId,
  );
  const workspace = useAtomValue(workspacesAtom).find(
    (entry) => entry.id === session?.workspaceId,
  );
  const sendAssistantMessage = useSetAtom(sendAssistantMessageAtom);
  const newAssistantSession = useSetAtom(newAssistantSessionAtom);

  if (
    !sessionId ||
    !isAssistantSessionId(sessionId) ||
    !session ||
    !workspace ||
    !messagesLoaded[sessionId]
  ) {
    return null;
  }

  const suggestionIds = SECTION_SUGGESTIONS[section] ?? ["explore"];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border-subtle px-3 py-2">
      {messages.length === 0
        ? suggestionIds.map((id) => {
            const suggestion = ASSISTANT_SUGGESTIONS[id];
            return (
              <Button
                key={suggestion.labelKey}
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  void sendAssistantMessage({
                    session,
                    workspace,
                    content: t(suggestion.promptKey),
                  })
                }
              >
                {t(suggestion.labelKey)}
              </Button>
            );
          })
        : null}
      <Button
        className="ms-auto"
        size="sm"
        type="button"
        variant="outline"
        onClick={() => void newAssistantSession(workspace.id)}
      >
        <Plus className="size-3.5" />
        {t("assistant.newSession")}
      </Button>
    </div>
  );
}
