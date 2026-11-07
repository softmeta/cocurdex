import { Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type HostInstance,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, space, useThemeColors } from "@/theme";
import { measureAnchor } from "./anchored-menu";
import { CircleButton } from "./circle-button";
import { useFloatingSurface } from "./floating-surface";
import type { ListScreenHeaderProps } from "./header-action";

const CAPSULE_PADDING = 2;
const FIELD_HEIGHT = 44;

export function ListScreenHeader({
  title,
  titleAction,
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
  const titleButton = useRef<HostInstance>(null);
  const screenOptions = useMemo(() => ({ headerShown: false, title }), [title]);
  const titleStyle = [styles.title, { color: colors.foreground }];

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
      <Stack.Screen options={screenOptions} />
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
            <View style={styles.titleArea}>
              {titleAction ? (
                <Pressable
                  ref={titleButton}
                  accessibilityRole="button"
                  accessibilityLabel={titleAction.label}
                  testID={titleAction.testID}
                  onPress={() =>
                    measureAnchor(titleButton.current, titleAction.onPress)
                  }
                  style={({ pressed }) => [
                    styles.titleButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text numberOfLines={1} style={titleStyle}>
                    {title}
                  </Text>
                  <SymbolView
                    name={{
                      ios: "chevron.down",
                      android: "keyboard_arrow_down",
                    }}
                    size={16}
                    tintColor={colors.mutedForeground}
                  />
                </Pressable>
              ) : (
                <Text
                  accessibilityRole="header"
                  numberOfLines={1}
                  style={titleStyle}
                >
                  {title}
                </Text>
              )}
            </View>
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
  titleArea: { flex: 1, minWidth: 0 },
  title: { flexShrink: 1, fontSize: 30, lineHeight: 38, fontWeight: "700" },
  titleButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 48,
    minWidth: 48,
    maxWidth: "100%",
  },
  pressed: { opacity: 0.65 },
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
