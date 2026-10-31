import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { control, space, useThemeColors } from "@/theme";

export interface DraftImage {
  key: string;
  uri: string;
  name: string;
  uploading: boolean;
}

const THUMBNAIL = 56;
const REMOVE_SIZE = 22;
const REMOVE_HIT_SLOP = (control.hitArea - REMOVE_SIZE) / 2;

export function AttachmentStrip({
  drafts,
  onRemove,
}: {
  drafts: readonly DraftImage[];
  onRemove(key: string): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  if (drafts.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {drafts.map((draft) => (
        <View key={draft.key} style={styles.item}>
          <Image
            accessibilityLabel={draft.name}
            source={{ uri: draft.uri }}
            style={[
              styles.thumbnail,
              { backgroundColor: colors.muted },
              draft.uploading && styles.uploading,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("composer.removeImage", { name: draft.name })}
            hitSlop={REMOVE_HIT_SLOP}
            onPress={() => onRemove(draft.key)}
            style={[styles.remove, { backgroundColor: colors.foreground }]}
          >
            <SymbolView
              name={{ ios: "xmark", android: "close" }}
              size={12}
              tintColor={colors.background}
            />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.sm, paddingTop: space.xs, paddingRight: space.sm },
  item: { paddingTop: space.xs, paddingRight: space.xs },
  thumbnail: { width: THUMBNAIL, height: THUMBNAIL, borderRadius: 12 },
  uploading: { opacity: 0.5 },
  remove: {
    position: "absolute",
    top: 0,
    right: 0,
    width: REMOVE_SIZE,
    height: REMOVE_SIZE,
    borderRadius: REMOVE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
