import {
  AGENT_ROLE_AVATAR_COLORS,
  AGENT_ROLE_AVATAR_FACES,
  AGENT_ROLE_AVATAR_SHAPES,
  type AgentRoleAvatar,
  type AgentRoleAvatarColor,
  type AgentRoleAvatarFace,
  normalizeAgentRoleAvatar,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { space, useThemeColors } from "@/theme";
import { AVATAR_COLOR } from "./avatar-hue";
import { RoleAvatar, type RoleAvatarSource } from "./role-avatar";

const TILE = 44;
const GLYPH = 30;
const SWATCH = 28;

function Tile({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        (selected || pressed) && { backgroundColor: colors.muted },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function AvatarPicker({
  role,
  onChange,
}: {
  role: RoleAvatarSource;
  onChange(avatar: AgentRoleAvatar): void;
}) {
  const { t } = useTranslation("assistant");
  const colors = useThemeColors();
  const faces: Record<AgentRoleAvatarFace, string> = {
    dots: t("form.avatar.face.dots"),
    happy: t("form.avatar.face.happy"),
    wink: t("form.avatar.face.wink"),
    sleepy: t("form.avatar.face.sleepy"),
    curious: t("form.avatar.face.curious"),
  };
  const swatches: Record<AgentRoleAvatarColor, string> = {
    gray: t("form.avatar.colors.gray"),
    red: t("form.avatar.colors.red"),
    orange: t("form.avatar.colors.orange"),
    amber: t("form.avatar.colors.amber"),
    green: t("form.avatar.colors.green"),
    teal: t("form.avatar.colors.teal"),
    blue: t("form.avatar.colors.blue"),
    violet: t("form.avatar.colors.violet"),
    pink: t("form.avatar.colors.pink"),
  };
  const current = resolveAgentRoleAvatar(role);
  const shaped = current.kind === "shape" ? current : null;
  const shape = shaped?.shape ?? AGENT_ROLE_AVATAR_SHAPES[0];
  const face = shaped?.face ?? AGENT_ROLE_AVATAR_FACES[0];
  const color = current.color;
  const preview = (avatar: AgentRoleAvatar) => ({ ...role, avatar });
  const setColor = (next: AgentRoleAvatarColor) =>
    onChange({ ...current, color: next });
  const setEmoji = (text: string) => {
    const next = normalizeAgentRoleAvatar({
      kind: "emoji",
      emoji: text,
      color,
    });
    if (next) onChange(next);
  };

  return (
    <View style={styles.picker}>
      <View style={styles.grid} accessibilityLabel={t("form.avatar.shapes")}>
        {AGENT_ROLE_AVATAR_SHAPES.map((option, index) => (
          <Tile
            key={option}
            label={t("form.avatar.shape", { index: index + 1 })}
            selected={shaped?.shape === option}
            onPress={() =>
              onChange({ kind: "shape", shape: option, face, color })
            }
          >
            <RoleAvatar
              role={preview({ kind: "shape", shape: option, face, color })}
              size={GLYPH}
            />
          </Tile>
        ))}
      </View>
      <View style={styles.grid} accessibilityLabel={t("form.avatar.faces")}>
        {AGENT_ROLE_AVATAR_FACES.map((option) => (
          <Tile
            key={option}
            label={faces[option]}
            selected={shaped?.face === option}
            onPress={() =>
              onChange({ kind: "shape", shape, face: option, color })
            }
          >
            <RoleAvatar
              role={preview({ kind: "shape", shape, face: option, color })}
              size={GLYPH}
            />
          </Tile>
        ))}
      </View>
      <View style={styles.grid} accessibilityLabel={t("form.avatar.color")}>
        {AGENT_ROLE_AVATAR_COLORS.map((option) => (
          <Tile
            key={option}
            label={swatches[option]}
            selected={option === color}
            onPress={() => setColor(option)}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: colors[AVATAR_COLOR[option]] },
              ]}
            />
          </Tile>
        ))}
      </View>
      <TextInput
        testID="assistant-form-avatar-emoji"
        accessibilityLabel={t("form.avatar.custom")}
        placeholder={t("form.avatar.custom")}
        placeholderTextColor={colors.mutedForeground}
        defaultValue={current.kind === "emoji" ? current.emoji : ""}
        maxLength={8}
        onChangeText={setEmoji}
        style={[styles.emoji, { color: colors.foreground }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: space.sm, paddingVertical: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 },
  emoji: { minHeight: TILE, fontSize: 17 },
});
