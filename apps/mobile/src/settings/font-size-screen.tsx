import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { MarkdownText } from "@/markdown";
import {
  CODE_SIZES,
  type CodeSize,
  setCodeSize,
  setTextSize,
  TEXT_SIZES,
  type TextSize,
  usePreferences,
} from "@/preferences";
import { space } from "@/theme";
import { Form, FormCell, FormRow, FormSection, SelectedMark } from "@/ui";

export function useTextSizeLabels(): Record<TextSize, string> {
  const { t } = useTranslation("settings");
  return {
    small: t("fontSize.small"),
    default: t("fontSize.default"),
    large: t("fontSize.large"),
    xlarge: t("fontSize.xlarge"),
  };
}

export function useCodeSizeLabels(): Record<CodeSize, string> {
  const { t } = useTranslation("settings");
  return {
    small: t("fontSize.small"),
    default: t("fontSize.default"),
    large: t("fontSize.large"),
  };
}

export function FontSizeScreen() {
  const { t } = useTranslation("settings");
  const { textSize, codeSize } = usePreferences();
  const textLabels = useTextSizeLabels();
  const codeLabels = useCodeSizeLabels();
  return (
    <Form>
      <FormSection>
        <FormCell>
          <View style={styles.preview} testID="settings-font-preview">
            <MarkdownText markdown={t("fontSize.preview")} />
          </View>
        </FormCell>
      </FormSection>
      <FormSection title={t("fontSize.text")}>
        {TEXT_SIZES.map((size) => (
          <FormRow
            key={size}
            testID={`settings-text-size-${size}`}
            selected={textSize === size}
            onPress={() => setTextSize(size)}
            trailing={<SelectedMark selected={textSize === size} />}
          >
            {textLabels[size]}
          </FormRow>
        ))}
      </FormSection>
      <FormSection title={t("fontSize.code")}>
        {CODE_SIZES.map((size) => (
          <FormRow
            key={size}
            testID={`settings-code-size-${size}`}
            selected={codeSize === size}
            onPress={() => setCodeSize(size)}
            trailing={<SelectedMark selected={codeSize === size} />}
          >
            {codeLabels[size]}
          </FormRow>
        ))}
      </FormSection>
    </Form>
  );
}

const styles = StyleSheet.create({
  preview: { padding: space.md },
});
