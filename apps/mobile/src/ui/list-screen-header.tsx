import { Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, space, useThemeColors } from "@/theme";
import { CircleButton } from "./circle-button";
import { useFloatingSurface } from "./floating-surface";
import type { ListScreenHeaderProps } from "./header-action";

const CAPSULE_PADDING = 2;
const FIELD_HEIGHT = 44;

export function ListScreenHeader({
  title,
  search,
  actions = [],
  background,
}: ListScreenHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const surface = useFloatingSurface();
  const top = useSafeAreaInsets().top;
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const changeQuery = (next: string) => {
    setQuery(next);
    search?.onQuery(next);
  };
  const closeSearch = () => {
    setSearching(false);
    changeQuery("");
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title }} />
      <View
        style={[
          styles.header,
          {
            paddingTop: top + space.sm,
            backgroundColor: background ?? colors.background,
          },
        ]}
      >
        {searching && search ? (
          <View style={styles.row}>
            <TextInput
              autoFocus
              value={query}
              onChangeText={changeQuery}
              placeholder={search.placeholder}
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.tint}
              cursorColor={colors.tint}
              returnKeyType="search"
              style={[
                styles.field,
                { backgroundColor: colors.muted, color: colors.foreground },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={closeSearch}
              style={styles.cancel}
            >
              <Text style={[styles.cancelLabel, { color: colors.foreground }]}>
                {t("actions.cancel")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: colors.foreground }]}
            >
              {title}
            </Text>
            {search || actions.length > 0 ? (
              <View style={[styles.capsule, surface]}>
                {search ? (
                  <CircleButton
                    icon={{ ios: "magnifyingglass", android: "search" }}
                    label={t("actions.search")}
                    onPress={() => setSearching(true)}
                  />
                ) : null}
                {actions.map((action) => (
                  <CircleButton
                    key={action.key}
                    icon={action.icon}
                    label={action.label}
                    badge={action.badge}
                    disabled={action.disabled}
                    onPress={action.onPress}
                  />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.sideMargin,
    paddingBottom: space.sm,
  },
  row: {
    minHeight: 48 + CAPSULE_PADDING * 2,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  title: { flex: 1, fontSize: 30, lineHeight: 38, fontWeight: "700" },
  capsule: {
    flexDirection: "row",
    padding: CAPSULE_PADDING,
    borderRadius: 24 + CAPSULE_PADDING,
  },
  field: {
    flex: 1,
    height: FIELD_HEIGHT,
    borderRadius: FIELD_HEIGHT / 2,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  cancel: { minHeight: FIELD_HEIGHT, justifyContent: "center" },
  cancelLabel: { fontSize: 16 },
});
