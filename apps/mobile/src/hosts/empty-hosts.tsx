import { Button, Column, Text } from "@expo/ui";
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
    <View style={[styles.center, { paddingBottom: tabBarInset }]}>
      <BrandHost matchContents={{ vertical: true }}>
        <Column alignment="center" spacing={space.md}>
          <Text textStyle={{ fontWeight: "600" }}>{t("empty.title")}</Text>
          <Text
            textStyle={{ color: colors.mutedForeground, textAlign: "center" }}
          >
            {t("empty.description")}
          </Text>
          <Button label={t("empty.scan")} onPress={onScan} />
          <Button variant="text" label={t("empty.paste")} onPress={onPaste} />
        </Column>
      </BrandHost>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: space.lg },
});
