import type { AgentThinkingLevel, SessionRecord } from "@cocurdex/shared";
import { createProviderSnapshotForModel } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import type { Ref } from "react";
import { toast } from "sonner";
import {
  ChatView,
  toolCallsBySessionAtom,
  useSessionMessages,
} from "@/features/agent";
import {
  ChatContextMeter,
  chatProviderModelsAtom,
  getChatThinkingLevelOptions,
  ModelPicker,
  resolveChatThinkingLevel,
} from "@/features/chat";
import type { ChatComposerHandle } from "@/features/composer";
import {
  getAgentDisplayLabel,
  getDisplaySessionStatus,
} from "@/features/sessions";
import { useChatSessionActions } from "./use-chat-session-actions";

interface ChatSessionPanelProps {
  session: SessionRecord;
  composerRef?: Ref<ChatComposerHandle>;
  paneId?: string;
}

function notifyFailure(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function ChatSessionPanel({
  session,
  composerRef,
  paneId,
}: ChatSessionPanelProps) {
  const messages = useSessionMessages(session.id);
  const toolCalls = useAtomValue(toolCallsBySessionAtom)[session.id] ?? [];
  const compatibleModels = useAtomValue(chatProviderModelsAtom);
  const actions = useChatSessionActions(paneId);
  const snapshot = session.providerSnapshot ?? null;
  const status = getDisplaySessionStatus(session.status, messages);
  const isRunning = status === "running";
  const thinkingLevelOptions = getChatThinkingLevelOptions(snapshot);
  const thinkingLevel = resolveChatThinkingLevel(
    thinkingLevelOptions,
    snapshot?.thinkingLevel,
    "off",
  );

  const changeModel = (providerId: string, modelId: string) => {
    const selected = compatibleModels.find(
      ({ model }) =>
        model.providerId === providerId && model.modelId === modelId,
    );
    if (!selected) return;
    const next = createProviderSnapshotForModel(selected);
    const nextThinking = resolveChatThinkingLevel(
      getChatThinkingLevelOptions(next),
      thinkingLevel,
      "off",
    );
    void actions
      .configure({
        ...session,
        providerSnapshot: { ...next, thinkingLevel: nextThinking },
      })
      .catch(notifyFailure);
  };

  const changeThinkingLevel = (level: AgentThinkingLevel) => {
    if (!snapshot) return;
    void actions
      .configure({
        ...session,
        providerSnapshot: { ...snapshot, thinkingLevel: level },
      })
      .catch(notifyFailure);
  };

  return (
    <ChatView
      key={session.id}
      agentLabel={getAgentDisplayLabel(session.agentType)}
      agentType={session.agentType}
      chatComposer={{
        controls: (
          <ModelPicker
            disabled={isRunning}
            modelId={snapshot?.modelId ?? null}
            onChange={changeModel}
            onThinkingLevelChange={changeThinkingLevel}
            providerId={snapshot?.providerId ?? null}
            thinkingLevel={thinkingLevel}
            thinkingLevelOptions={thinkingLevelOptions}
          />
        ),
        footerTrailing: (
          <ChatContextMeter sessionId={session.id} snapshot={snapshot} />
        ),
      }}
      composerRef={composerRef}
      isRunning={isRunning}
      messages={messages}
      onSend={(text, attachments) => {
        void actions.send(session, text, attachments, thinkingLevel);
      }}
      onStop={() => {
        void actions.stop(session).catch(notifyFailure);
      }}
      onSubmitPreviousMessage={(message, content) =>
        actions.resubmit(session, message, content)
      }
      providerSnapshot={snapshot}
      sessionId={session.id}
      sessionModeId={null}
      status={session.status}
      toolCalls={toolCalls}
    />
  );
}
