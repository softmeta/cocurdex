import type { ConversationRecord, MessageAttachment } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { JumpControls, useStickToBottom } from "@/components/chat";
import { Button, EmptyState, ScrollArea, Spinner } from "@/components/ui";
import {
  ChatComposer,
  ChatContentColumn,
  ComposerSurface,
  ComposerSurfaceBody,
  conversationComposerDraftKey,
} from "@/features/composer";
import { desktopApi, useMountEffect } from "@/lib";
import { ConversationContextMeter } from "./chat-context-meter";
import { rehydrateChatImages } from "./chat-images";
import { ConversationMessage } from "./chat-message";
import {
  loadConversationMessagesAtom,
  messagesByConversationAtom,
  messagesLoadedAtom,
  streamingConversationIdsAtom,
  upsertConversationAtom,
} from "./chat-store";
import { ModelPicker } from "./model-picker";
import { WebSearchMenuItem } from "./web-search-menu-item";

interface ConversationDetailProps {
  conversation: ConversationRecord;
}

// Pure-chat surfaces reuse ChatComposer. The empty state mirrors the new-
// session card (panel variant + welcome tone) so the two "first impression"
// surfaces look identical; ongoing conversations keep the compact pill at
// the bottom for follow-ups. Agent-only chrome (collab/permission/agent
// dropdown) is replaced by a model picker: on the left control row for the
// fresh/empty card (matching agent mode's new-session layout), and bundled
// with the context ring on the right for in-conversation follow-ups (matching
// agent mode's ContextWindowIndicator). Plus a web-search toggle in the attach
// menu.
export function ConversationDetail({ conversation }: ConversationDetailProps) {
  return (
    <ConversationDetailContent
      conversation={conversation}
      key={conversation.id}
    />
  );
}

function ConversationDetailContent({ conversation }: ConversationDetailProps) {
  const { t } = useTranslation("chat");
  const messagesMap = useAtomValue(messagesByConversationAtom);
  const loadedMap = useAtomValue(messagesLoadedAtom);
  const streamingIds = useAtomValue(streamingConversationIdsAtom);
  const loadMessages = useSetAtom(loadConversationMessagesAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
  const [loadError, setLoadError] = useState<string | null>(null);

  const messages = messagesMap[conversation.id] ?? [];
  const loaded = loadedMap[conversation.id] ?? false;
  const isStreaming = streamingIds.has(conversation.id);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  // Follow-the-stream + jump controls — same contract as agent ChatView,
  // via the shared stick/jump primitives in components/chat.
  const {
    contentRef,
    jumpButton,
    reengageStick,
    scrollToLatest,
    scrollToTop,
    viewportProps,
  } = useStickToBottom(scrollViewportRef);

  const reloadMessages = () => {
    setLoadError(null);
    void loadMessages(conversation.id).catch((error) =>
      setLoadError(String(error)),
    );
  };
  useMountEffect(reloadMessages);

  const handleModelChange = async (providerId: string, modelId: string) => {
    const updated = await desktopApi.chatUpdate({
      conversationId: conversation.id,
      providerId,
      modelId,
    });
    if (updated) upsertConversation({ conversation: updated });
  };

  const handleSend = async (text: string, attachments: MessageAttachment[]) => {
    if (isStreaming) return;
    // New turn always re-follows the stream, even if the user had scrolled up
    // to read history (mirrors agent chat's send-time bottom re-lock).
    reengageStick();
    const dataUrlImages = await rehydrateChatImages(attachments);
    await desktopApi.chatSendMessage({
      conversationId: conversation.id,
      text,
      images: dataUrlImages.length > 0 ? dataUrlImages : undefined,
    });
  };

  const handleStop = async () => {
    await desktopApi
      .chatStopStream(conversation.id)
      .catch((error) => toast.error(String(error)));
  };

  const handleEditUser = async (messageId: string, text: string) => {
    if (isStreaming) return;
    reengageStick();
    try {
      await desktopApi.chatEditMessage({
        conversationId: conversation.id,
        messageId,
        text,
      });
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleRetryAssistant = async (messageId: string) => {
    if (isStreaming) return;
    reengageStick();
    try {
      await desktopApi.chatRetryMessage({
        conversationId: conversation.id,
        messageId,
      });
    } catch (error) {
      toast.error(String(error));
    }
  };

  const modelPicker = (
    <ModelPicker
      providerId={conversation.providerId}
      modelId={conversation.modelId}
      onChange={(providerId, modelId) => {
        void handleModelChange(providerId, modelId).catch((error) =>
          toast.error(String(error)),
        );
      }}
      disabled={isStreaming}
    />
  );
  // In-conversation footer mirrors agent mode's ContextWindowIndicator: model
  // label and context ring together on the right edge. The picker stays
  // interactive since chat lets you switch model mid-conversation.
  const composerFooterTrailing = (
    <>
      {modelPicker}
      <ConversationContextMeter
        providerId={conversation.providerId}
        modelId={conversation.modelId}
        messages={messages}
      />
    </>
  );

  // Web search lives inside the composer's "+" attach dropdown rather than as
  // a standalone toolbar toggle, keeping the control row compact.
  const composerAttachMenuExtras = <WebSearchMenuItem />;

  const followUpComposer = (
    <ChatComposer
      mode="chat"
      variant="pill"
      draftKey={conversationComposerDraftKey(conversation.id)}
      isRunning={isStreaming}
      footerTrailing={composerFooterTrailing}
      attachMenuExtras={composerAttachMenuExtras}
      placeholderOverride={t("composer.placeholder", {
        defaultValue: "Ask anything…",
      })}
      onSend={handleSend}
      onStop={() => {
        void handleStop();
      }}
    />
  );

  // Empty conversation: render the same welcome-toned panel card as the new-
  // agent-session entry so both "fresh start" surfaces line up — same width,
  // same vertical position, same chrome. Structurally mirrors the agent
  // branch of CenterPanel (block container > LAYOUT div > body div) so the
  // computed vertical center is byte-identical and switching between the two
  // never moves the composer.
  if (loadError && !hasMessages) {
    return (
      <EmptyState
        title={t("detail.loadFailed", {
          defaultValue: "Could not load conversation",
        })}
        description={loadError}
        action={
          <Button onClick={reloadMessages} variant="outline">
            {t("message.retry", { defaultValue: "Retry" })}
          </Button>
        }
      />
    );
  }
  if (!loaded && !hasMessages) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (!hasMessages) {
    return (
      <ComposerSurface className="h-full bg-chat-canvas">
        <ComposerSurfaceBody>
          <ChatComposer
            mode="chat"
            variant="panel"
            tone="welcome"
            draftKey={conversationComposerDraftKey(conversation.id)}
            mentionMenuPlacement="bottom"
            isRunning={isStreaming}
            controls={modelPicker}
            attachMenuExtras={composerAttachMenuExtras}
            placeholderOverride={t("composer.placeholder", {
              defaultValue: "Ask anything…",
            })}
            onSend={handleSend}
            onStop={() => {
              void handleStop();
            }}
          />
        </ComposerSurfaceBody>
      </ComposerSurface>
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-chat-canvas">
      <div className="relative min-h-0 flex-1">
        <ScrollArea
          className="h-full px-2 md:px-3 xl:px-6"
          viewportProps={viewportProps}
          viewportRef={scrollViewportRef}
        >
          <ChatContentColumn
            className="flex flex-col gap-4 py-6"
            ref={contentRef}
          >
            {messages.map((message) => (
              <ConversationMessage
                key={message.id}
                message={message}
                canEdit={message.role === "user" && !isStreaming}
                canRetry={
                  message.role === "assistant" &&
                  !isStreaming &&
                  (message.status === "errored" ||
                    message.status === "completed" ||
                    message.status === "cancelled")
                }
                busy={isStreaming}
                onEdit={(messageId, text) => {
                  void handleEditUser(messageId, text);
                }}
                onRetry={(messageId) => {
                  void handleRetryAssistant(messageId);
                }}
              />
            ))}
          </ChatContentColumn>
        </ScrollArea>

        <JumpControls
          onJumpToLatest={() => scrollToLatest("smooth")}
          onJumpToTop={() => scrollToTop("smooth")}
          showJumpToLatest={jumpButton === "latest"}
          showJumpToTop={jumpButton === "top"}
        />
      </div>

      <div className="bg-linear-to-t from-chat-canvas via-chat-canvas to-transparent p-2 md:px-3 xl:px-6">
        <ChatContentColumn className="flex flex-col gap-2">
          {followUpComposer}
        </ChatContentColumn>
      </div>
    </section>
  );
}
