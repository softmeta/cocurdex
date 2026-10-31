import {
  type AgentId,
  type AgentRoleAvatar,
  type AgentRoleAvatarColor,
  agentRoleInitial,
  defaultAgentRoleAvatarColor,
} from "@cocurdex/shared";
import { StyleSheet, Text, View } from "react-native";
import { type ThemeColors, useThemeColors } from "@/theme";
import { AgentIcon } from "./agent-icon";

export interface RoleAvatarSource {
  id: string;
  name: string;
  avatar: AgentRoleAvatar | null;
}

const AVATAR_COLOR: Record<AgentRoleAvatarColor, keyof ThemeColors> = {
  gray: "roleAvatarGray",
  red: "roleAvatarRed",
  orange: "roleAvatarOrange",
  amber: "roleAvatarAmber",
  green: "roleAvatarGreen",
  teal: "roleAvatarTeal",
  blue: "roleAvatarBlue",
  violet: "roleAvatarViolet",
  pink: "roleAvatarPink",
};

const TINT_ALPHA = "26";

export function RoleAvatar({
  role,
  agentId,
  size = 20,
}: {
  role: RoleAvatarSource;
  agentId?: AgentId;
  size?: number;
}) {
  const colors = useThemeColors();
  const hue =
    colors[
      AVATAR_COLOR[role.avatar?.color ?? defaultAgentRoleAvatarColor(role.id)]
    ];
  const emoji = role.avatar?.kind === "emoji" ? role.avatar.emoji : null;
  const badge = Math.round(size * 0.5);
  return (
    <View
      accessible={false}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${hue}${TINT_ALPHA}`,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          color: hue,
          fontSize: Math.round(size * (emoji ? 0.62 : 0.5)),
          fontWeight: "600",
        }}
      >
        {emoji ?? agentRoleInitial(role.name)}
      </Text>
      {agentId ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.background,
              borderRadius: badge,
              right: -badge / 4,
              bottom: -badge / 4,
            },
          ]}
        >
          <AgentIcon agentId={agentId} size={badge} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", padding: 1 },
});
