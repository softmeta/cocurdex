import {
  AGENT_ROLE_AVATAR_FACE_FEATURES,
  AGENT_ROLE_AVATAR_SHAPE_PATHS,
  AGENT_ROLE_AVATAR_VIEWBOX,
  type AgentId,
  type AgentRoleAvatar,
  type AgentRoleAvatarColor,
  agentRoleInitial,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
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
  const avatar = resolveAgentRoleAvatar(role);
  const hue = colors[AVATAR_COLOR[avatar.color]];
  const badge = Math.round(size * 0.5);
  const isShape = avatar.kind === "shape";
  const emoji = avatar.kind === "emoji" ? avatar.emoji : null;
  return (
    <View
      accessible={false}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isShape ? undefined : `${hue}${TINT_ALPHA}`,
        },
      ]}
    >
      {avatar.kind === "shape" ? (
        <Svg
          height={size}
          viewBox={`0 0 ${AGENT_ROLE_AVATAR_VIEWBOX} ${AGENT_ROLE_AVATAR_VIEWBOX}`}
          width={size}
        >
          <Path d={AGENT_ROLE_AVATAR_SHAPE_PATHS[avatar.shape]} fill={hue} />
          {AGENT_ROLE_AVATAR_FACE_FEATURES[avatar.face].map((feature) =>
            feature.kind === "dot" ? (
              <Circle
                cx={feature.cx}
                cy={feature.cy}
                fill={colors.roleAvatarFace}
                key={`${feature.cx}:${feature.cy}`}
                r={feature.r}
              />
            ) : (
              <Path
                d={feature.d}
                fill="none"
                key={feature.d}
                stroke={colors.roleAvatarFace}
                strokeLinecap="round"
                strokeWidth={feature.width}
              />
            ),
          )}
        </Svg>
      ) : (
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
      )}
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
