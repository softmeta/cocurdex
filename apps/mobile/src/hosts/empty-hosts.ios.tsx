import { Button, ContentUnavailableView, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, tint } from "@expo/ui/swift-ui/modifiers";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { space, useThemeColors } from "@/theme";
import { BrandHost, useTabBarInset } from "@/ui";
import type { EmptyHostsProps } from "./empty-hosts-props";

export function EmptyHosts({ onScan, onPaste }: EmptyHostsProps) {
  const { t } = useTranslation("hosts");
  const colors = useThemeColors();
  const tabBarInset = useTabBarInset();
  return (
    <View style={[styles.fill, { paddingBottom: tabBarInset }]}>
      <BrandHost style={styles.fill}>
        <VStack spacing={space.lg}>
          <ContentUnavailableView
            title={t("empty.title")}
            systemImage="desktopcomputer"
            description={t("empty.description")}
          />
          <VStack spacing={space.sm}>
            <Button
              label={t("empty.scan")}
              systemImage="qrcode.viewfinder"
              onPress={onScan}
              modifiers={[
                buttonStyle("borderedProminent"),
                controlSize("large"),
                tint(colors.primary),
              ]}
            />
            <Button
              label={t("empty.paste")}
              onPress={onPaste}
              modifiers={[buttonStyle("borderless"), controlSize("large")]}
            />
          </VStack>
        </VStack>
      </BrandHost>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
