import { getChatThinkingLevelOptions } from "@cocurdex/client-runtime";
import type {
  AgentProviderSnapshot,
  AgentThinkingLevel,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Keyboard, StyleSheet, View } from "react-native";
import { thinkingOptionLabel, useRuntimeLabels } from "@/session-runtime";
import { keyboardHidden, useOptionSheet } from "@/ui";
import type { ChatModel } from "./chat-models";
import { ConfigTrigger } from "./config-trigger";

export function ChatRuntimeControls({
  testIDPrefix = "chat",
  models,
  selected,
  snapshot,
  thinkingLevel,
  onModel,
  onThinkingLevel,
}: {
  testIDPrefix?: string;
  models: readonly ChatModel[];
  selected: ChatModel | null;
  snapshot: AgentProviderSnapshot | null;
  thinkingLevel: AgentThinkingLevel | null;
  onModel(model: ChatModel): void;
  onThinkingLevel(level: AgentThinkingLevel): void;
}) {
  const { t } = useTranslation("sessions");
  const labels = useRuntimeLabels();
  const open = useOptionSheet();
  const thinkingOptions = getChatThinkingLevelOptions(snapshot);
  const thinking = thinkingOptions.find(
    (option) => option.level === thinkingLevel,
  );
  const modelName = selected?.model.name ?? snapshot?.modelName ?? null;

  const present = async (request: Parameters<typeof open>[0]) => {
    Keyboard.dismiss();
    await keyboardHidden();
    open(request);
  };

  const openModels = () =>
    void present({
      title: t("newSession.model"),
      items: models.map((entry) => ({
        key: `${entry.provider.id}/${entry.model.modelId}`,
        testID: `${testIDPrefix}-model-${entry.provider.id}/${entry.model.modelId}`,
        label: entry.model.name,
        supporting: entry.provider.name,
        selected:
          selected?.provider.id === entry.provider.id &&
          selected.model.modelId === entry.model.modelId,
        onPress: () => onModel(entry),
      })),
    });

  const openThinking = () =>
    void present({
      title: labels.thinking,
      items: thinkingOptions.map((option) => ({
        key: option.level,
        testID: `${testIDPrefix}-thinking-${option.level}`,
        label: thinkingOptionLabel(option, labels),
        selected: option.level === thinkingLevel,
        onPress: () => onThinkingLevel(option.level),
      })),
    });

  return (
    <View style={styles.row}>
      {modelName ? (
        <ConfigTrigger
          testID={`${testIDPrefix}-model`}
          summary={modelName}
          mode={null}
          onPress={openModels}
        />
      ) : null}
      {thinking ? (
        <ConfigTrigger
          testID={`${testIDPrefix}-thinking`}
          summary={thinkingOptionLabel(thinking, labels)}
          mode={null}
          onPress={openThinking}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    minWidth: 0,
    flexShrink: 1,
  },
});
