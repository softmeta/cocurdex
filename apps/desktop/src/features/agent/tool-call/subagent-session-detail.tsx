import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui";
import { loadTurnChangeSetsAtom } from "@/features/turn-workspace-changes";
import { desktopApi, useMountEffect } from "@/lib";
// Intentional render recursion: a tool call can expand into a subagent
// transcript, whose items render tool call groups again. The import cycle is
// structural, not a layering mistake — keep the imports deep (never the
// tool-call barrel) so it stays confined to these three modules.
import { ChatConversationItem } from "../view/chat-conversation-item";
import {
  createConversationGroups,
  createTimelineGroups,
} from "../view/chat-timeline";
import {
  loadSessionMessagesAtom,
  loadTurnStatsAtom,
  messagesBySessionAtom,
  messagesLoadedBySessionAtom,
} from "../view/message-store";
import {
  loadSessionToolCallsAtom,
  toolCallsBySessionAtom,
  toolCallsLoadedBySessionAtom,
} from "./tool-call-store";

export function ReadonlySubagentSession({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const { t } = useTranslation("agent");

  if (!sessionId) {
    return (
      <div className="rounded-control bg-chat-code-panel p-3 text-xs text-chat-fg-muted">
        {t("toolCalls.subagentEmpty")}
      </div>
    );
  }

  return <LoadedSubagentSession key={sessionId} sessionId={sessionId} />;
}

function LoadedSubagentSession({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("agent");
  const messagesBySession = useAtomValue(messagesBySessionAtom);
  const toolCallsBySession = useAtomValue(toolCallsBySessionAtom);
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const loadSessionMessages = useSetAtom(loadSessionMessagesAtom);
  const loadTurnStats = useSetAtom(loadTurnStatsAtom);
  const loadTurnChangeSets = useSetAtom(loadTurnChangeSetsAtom);
  const loadSessionToolCalls = useSetAtom(loadSessionToolCallsAtom);
  const messagesLoaded = Boolean(messagesLoadedBySession[sessionId]);
  const toolCallsLoaded = Boolean(toolCallsLoadedBySession[sessionId]);

  useMountEffect(() => {
    if (messagesLoaded && toolCallsLoaded) {
      return;
    }

    let cancelled = false;

    void Promise.all([
      messagesLoaded
        ? Promise.resolve({
            messages: messagesBySession[sessionId] ?? [],
            turnStats: {},
            turnChangeSets: {},
          })
        : desktopApi.listSessionMessages(sessionId),
      toolCallsLoaded
        ? Promise.resolve(toolCallsBySession[sessionId] ?? [])
        : desktopApi.listSessionToolCalls(sessionId),
    ]).then(([messageResult, toolCalls]) => {
      if (cancelled) {
        return;
      }

      if (!messagesLoaded) {
        loadSessionMessages({
          messages: messageResult.messages,
          sessionId,
        });
        loadTurnStats(messageResult.turnStats);
        loadTurnChangeSets({
          changeSets: messageResult.turnChangeSets ?? {},
          sessionId,
        });
      }

      if (!toolCallsLoaded) {
        loadSessionToolCalls({ toolCalls, sessionId });
      }
    });

    return () => {
      cancelled = true;
    };
  });

  const conversationGroups = useMemo(() => {
    return createConversationGroups(
      createTimelineGroups(
        messagesBySession[sessionId] ?? [],
        toolCallsBySession[sessionId] ?? [],
      ),
    );
  }, [messagesBySession, sessionId, toolCallsBySession]);

  if (!messagesLoaded || !toolCallsLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-control bg-chat-code-panel p-3 text-xs text-chat-fg-muted">
        <Spinner size="xs" />
        <span>{t("toolCalls.outputLoading")}</span>
      </div>
    );
  }

  if (conversationGroups.length === 0) {
    return (
      <div className="rounded-control bg-chat-code-panel p-3 text-xs text-chat-fg-muted">
        {t("toolCalls.subagentEmpty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {conversationGroups.map((conversationGroup) => (
        <ChatConversationItem
          conversationGroup={conversationGroup}
          isLatestConversation={false}
          isRunning={true}
          key={conversationGroup.id}
          latestMessageId={null}
          promptVariant="context"
          setUserMessageRef={() => {}}
          showMessageActions={false}
        />
      ))}
    </div>
  );
}
