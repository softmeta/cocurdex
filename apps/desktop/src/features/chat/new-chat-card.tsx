import type {
  AgentProviderSnapshot,
  AgentThinkingLevel,
  MessageAttachment,
} from "@cocurdex/shared";
import { createProviderSnapshotForModel } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  ChatComposer,
  ComposerSurfaceBody,
  newChatComposerDraftKey,
  WelcomeHeading,
} from "@/features/composer";
import {
  bootstrapProviderModelsAtom,
  providerModelsAtom,
} from "@/features/sessions";
// Sub-entry, not the settings barrel: that barrel reaches SettingsScreen ->
// @/app/layout, closing an initialization cycle back onto this module.
import { openSettings } from "@/features/settings/settings-navigation";
import { useMountEffect } from "@/lib";
import { chatProviderModelsAtom } from "./chat-models";
import { chatSessionsAtom } from "./chat-sessions";
import {
  getChatThinkingLevelOptions,
  NEW_CHAT_THINKING_LEVEL,
  resolveChatThinkingLevel,
} from "./chat-thinking-level";
import { ModelPicker } from "./model-picker";

export interface StartChatPayload {
  providerSnapshot: AgentProviderSnapshot;
  thinkingLevel: AgentThinkingLevel | null;
  text: string;
  attachments: MessageAttachment[];
}

interface NewChatCardProps {
  onStartChat(payload: StartChatPayload): void | Promise<void>;
}

interface ModelKey {
  providerId: string;
  modelId: string;
}

function sameModel(left: ModelKey, right: ModelKey) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

export function NewChatCard({ onStartChat }: NewChatCardProps) {
  const { t } = useTranslation("chat");
  const models = useAtomValue(providerModelsAtom);
  const chatSessions = useAtomValue(chatSessionsAtom);
  const compatibleModels = useAtomValue(chatProviderModelsAtom);
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const [picked, setPicked] = useState<ModelKey | null>(null);
  const [pickedThinkingLevel, setPickedThinkingLevel] =
    useState<AgentThinkingLevel | null>(null);

  useMountEffect(() => {
    if (models.length === 0) {
      void bootstrapProviderModels();
    }
  });

  const recentSnapshot = chatSessions[0]?.providerSnapshot ?? null;
  const findCompatible = (key: ModelKey | null) =>
    key
      ? (compatibleModels.find(({ model }) => sameModel(model, key)) ?? null)
      : null;
  const selected =
    findCompatible(picked) ??
    findCompatible(recentSnapshot) ??
    compatibleModels[0] ??
    null;
  const providerSnapshot = selected
    ? createProviderSnapshotForModel(selected)
    : null;
  const thinkingLevelOptions = getChatThinkingLevelOptions(providerSnapshot);
  const thinkingLevel = resolveChatThinkingLevel(
    thinkingLevelOptions,
    pickedThinkingLevel ?? recentSnapshot?.thinkingLevel,
    NEW_CHAT_THINKING_LEVEL,
  );

  const controls = (
    <ModelPicker
      providerId={selected?.provider.id ?? null}
      modelId={selected?.model.modelId ?? null}
      onChange={(providerId, modelId) => setPicked({ providerId, modelId })}
      thinkingLevel={thinkingLevel}
      thinkingLevelOptions={thinkingLevelOptions}
      onThinkingLevelChange={setPickedThinkingLevel}
    />
  );

  return (
    <ComposerSurfaceBody className="flex flex-col">
      <WelcomeHeading>
        {selected ? t("detail.empty.title") : t("detail.empty.noProviderTitle")}
        {selected ? null : (
          <Button
            aria-label={t("detail.empty.openProviderSettings")}
            className="self-center"
            onClick={() => openSettings("providers")}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Settings2 className="size-4" />
          </Button>
        )}
      </WelcomeHeading>
      <ChatComposer
        mode="chat"
        variant="panel"
        tone="welcome"
        draftKey={newChatComposerDraftKey()}
        mentionMenuPlacement="bottom"
        controls={controls}
        canSubmit={Boolean(providerSnapshot)}
        placeholderOverride={t("composer.placeholder", {
          defaultValue: "Ask anything…",
        })}
        onSend={(text, attachments) => {
          if (!providerSnapshot) return;
          return onStartChat({
            providerSnapshot: { ...providerSnapshot, thinkingLevel },
            thinkingLevel,
            text,
            attachments,
          });
        }}
      />
    </ComposerSurfaceBody>
  );
}
