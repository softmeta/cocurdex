import type { MessageAttachment } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  ChatComposer,
  ComposerSurfaceBody,
  newConversationComposerDraftKey,
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
import { conversationsAtom } from "./chat-store";
import { ModelPicker } from "./model-picker";
import { WebSearchMenuItem } from "./web-search-menu-item";

export interface StartConversationPayload {
  providerId: string;
  modelId: string;
  webSearchEnabled: boolean;
  message: string;
  attachments?: MessageAttachment[];
}

interface NewConversationCardProps {
  onStartConversation(payload: StartConversationPayload): void;
}

// Chat-mode counterpart of NewSessionCard: the surface behind the chat tab. It
// reuses the welcome-toned ChatComposer so it lines up pixel-for-pixel with the
// agent card, and the model picker + web-search toggle stand in for the agent
// toolbar. Deliberately offers no workspace entry: projects belong to the
// projects tab, and chat runs without one.
export function NewConversationCard({
  onStartConversation,
}: NewConversationCardProps) {
  const { t } = useTranslation("chat");
  const models = useAtomValue(providerModelsAtom);
  const conversations = useAtomValue(conversationsAtom);
  const bootstrapProviderModels = useSetAtom(bootstrapProviderModelsAtom);
  const [picked, setPicked] = useState<{
    providerId: string;
    modelId: string;
  } | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const enabledModels = useMemo(
    () => models.filter((model) => model.enabled),
    [models],
  );

  // Ensure provider models are available so the picker can offer a default.
  // Cheap if already cached (mirrors the sidebar's new-chat handler). Mount-only
  // bootstrap — the store self-dedupes, so no need to re-run on model changes.
  useMountEffect(() => {
    if (models.length === 0) {
      void bootstrapProviderModels();
    }
  });

  // Remember the last-used model across restarts by reading it off the most
  // recent conversation (persisted in the DB). Honor it only while the model
  // is still enabled, mirroring the agent card's soft-default validation;
  // otherwise fall back to the first enabled model.
  const lastUsedModel = useMemo(() => {
    const recent = conversations
      .filter((c) => c.archivedAt == null)
      .sort((a, b) =>
        (b.lastMessageAt ?? b.updatedAt).localeCompare(
          a.lastMessageAt ?? a.updatedAt,
        ),
      )[0];
    if (!recent) {
      return null;
    }
    const stillEnabled = enabledModels.some(
      (m) => m.providerId === recent.providerId && m.modelId === recent.modelId,
    );
    return stillEnabled
      ? { providerId: recent.providerId, modelId: recent.modelId }
      : null;
  }, [conversations, enabledModels]);

  // Default to the last-used (then first enabled) model until the user picks
  // one explicitly — derived in render so it tracks the list without an effect.
  const firstEnabled = enabledModels[0];
  const selectedModel =
    picked ??
    lastUsedModel ??
    (firstEnabled
      ? { providerId: firstEnabled.providerId, modelId: firstEnabled.modelId }
      : null);

  // Model sits on the left control row to match agent mode and the in-
  // conversation composer. No usage yet, so no context ring on the right.
  const controls = (
    <ModelPicker
      providerId={selectedModel?.providerId ?? null}
      modelId={selectedModel?.modelId ?? null}
      onChange={(providerId, modelId) => setPicked({ providerId, modelId })}
    />
  );

  const attachMenuExtras = (
    <WebSearchMenuItem
      providerId={selectedModel?.providerId ?? null}
      enabled={webSearchEnabled}
      onChange={setWebSearchEnabled}
    />
  );

  // Without a provider the composer cannot send, so the heading points at the
  // one control that unblocks it (the model picker below, which opens
  // provider settings) instead of inviting a message.
  const welcomeTitle = selectedModel
    ? t("detail.empty.title")
    : t("detail.empty.noProviderTitle");

  return (
    <ComposerSurfaceBody className="flex flex-col">
      <WelcomeHeading>
        {welcomeTitle}
        {selectedModel ? null : (
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
        draftKey={newConversationComposerDraftKey()}
        mentionMenuPlacement="bottom"
        controls={controls}
        attachMenuExtras={attachMenuExtras}
        canSubmit={Boolean(selectedModel)}
        placeholderOverride={t("composer.placeholder", {
          defaultValue: "Ask anything…",
        })}
        onSend={(message, attachments) => {
          if (!selectedModel) return;
          onStartConversation({
            providerId: selectedModel.providerId,
            modelId: selectedModel.modelId,
            webSearchEnabled,
            message,
            attachments: attachments.length > 0 ? attachments : undefined,
          });
        }}
      />
    </ComposerSurfaceBody>
  );
}
