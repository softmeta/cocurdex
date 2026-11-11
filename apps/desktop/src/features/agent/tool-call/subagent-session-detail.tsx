import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui";
import { desktopApi, useMountEffect, watchSessionStream } from "@/lib";
import { ChatConversationItem } from "../view/chat-conversation-item";
import {
  createConversationGroups,
  createTimelineGroups,
} from "../view/chat-timeline";
import { messagesLoadedBySessionAtom } from "../view/message-store";
import { applyTranscriptPageAtom } from "../view/transcript-window";
import { useSessionMessages } from "../view/use-session-messages";
import {
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
      <div className="rounded-control bg-chat-code-panel p-3 text-body text-chat-fg-muted">
        {t("toolCalls.subagentEmpty")}
      </div>
    );
  }

  return <LoadedSubagentSession key={sessionId} sessionId={sessionId} />;
}

function LoadedSubagentSession({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("agent");
  const messages = useSessionMessages(sessionId);
  const toolCallsBySession = useAtomValue(toolCallsBySessionAtom);
  const messagesLoadedBySession = useAtomValue(messagesLoadedBySessionAtom);
  const toolCallsLoadedBySession = useAtomValue(toolCallsLoadedBySessionAtom);
  const applyTranscriptPage = useSetAtom(applyTranscriptPageAtom);
  const messagesLoaded = Boolean(messagesLoadedBySession[sessionId]);
  const toolCallsLoaded = Boolean(toolCallsLoadedBySession[sessionId]);

  useMountEffect(() => watchSessionStream(sessionId));

  useMountEffect(() => {
    if (messagesLoaded && toolCallsLoaded) {
      return;
    }

    let cancelled = false;

    void desktopApi.getTranscriptPage(sessionId, null).then((page) => {
      if (!cancelled) applyTranscriptPage({ sessionId, page });
    });

    return () => {
      cancelled = true;
    };
  });

  const conversationGroups = useMemo(() => {
    return createConversationGroups(
      createTimelineGroups(messages, toolCallsBySession[sessionId] ?? []),
    );
  }, [messages, sessionId, toolCallsBySession]);

  if (!messagesLoaded || !toolCallsLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-control bg-chat-code-panel p-3 text-body text-chat-fg-muted">
        <Spinner size="xs" />
        <span>{t("toolCalls.outputLoading")}</span>
      </div>
    );
  }

  if (conversationGroups.length === 0) {
    return (
      <div className="rounded-control bg-chat-code-panel p-3 text-body text-chat-fg-muted">
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
