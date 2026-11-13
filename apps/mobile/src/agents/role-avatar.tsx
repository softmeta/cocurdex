import {
  AGENT_ROLE_AVATAR_FACE_FEATURES,
  AGENT_ROLE_AVATAR_REST_GAZE,
  AGENT_ROLE_AVATAR_SHAPE_PATHS,
  AGENT_ROLE_AVATAR_VIEWBOX,
  type AgentId,
  type AgentRoleAvatar,
  agentRoleInitial,
  AGENT_ROLE_AVATAR_WORKING_MOTION as MOTION,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import { type ReactElement, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useThemeColors } from "@/theme";
import { AgentIcon } from "./agent-icon";
import { avatarEyeColor } from "./avatar-eye-color";
import { AVATAR_COLOR } from "./avatar-hue";

export interface RoleAvatarSource {
  id: string;
  name: string;
  avatar: AgentRoleAvatar | null;
}

const TINT_ALPHA = "26";
const DEFAULT_SIZE = 20;
const VIEWBOX = `0 0 ${AGENT_ROLE_AVATAR_VIEWBOX} ${AGENT_ROLE_AVATAR_VIEWBOX}`;

type ShapeAvatar = Extract<
  ReturnType<typeof resolveAgentRoleAvatar>,
  { kind: "shape" }
>;

function AvatarFaceFeatures({
  avatar,
  eye,
}: {
  avatar: ShapeAvatar;
  eye: string;
}) {
  return (
    <G x={AGENT_ROLE_AVATAR_REST_GAZE.x} y={AGENT_ROLE_AVATAR_REST_GAZE.y}>
      {AGENT_ROLE_AVATAR_FACE_FEATURES[avatar.face].map((feature) =>
        feature.kind === "dot" ? (
          <Circle
            cx={feature.cx}
            cy={feature.cy}
            fill={eye}
            key={`${feature.cx}:${feature.cy}`}
            r={feature.r}
          />
        ) : (
          <Path
            d={feature.d}
            fill="none"
            key={feature.d}
            stroke={eye}
            strokeLinecap="round"
            strokeWidth={feature.width}
          />
        ),
      )}
    </G>
  );
}

function AvatarFace({
  avatar,
  eye,
  size,
}: {
  avatar: ShapeAvatar;
  eye: string;
  size: number;
}) {
  return (
    <Svg height={size} viewBox={VIEWBOX} width={size}>
      <AvatarFaceFeatures avatar={avatar} eye={eye} />
    </Svg>
  );
}

const easeInOut = Easing.bezierFn(0.42, 0, 0.58, 1);

function glanceOffset(progress: number) {
  "worklet";
  const stops = MOTION.glance;
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1];
    const to = stops[index];
    if (progress <= to.at) {
      const t = (progress - from.at) / (to.at - from.at);
      return from.x + (to.x - from.x) * easeInOut(t);
    }
  }
  return 0;
}

function useWorkingMotion(size: number) {
  const reduced = useReducedMotion();
  const bob = useSharedValue(0);
  const glance = useSharedValue(0);
  const attach = useCallback(
    (node: unknown) => {
      if (!node || reduced) return;
      bob.value = withRepeat(
        withTiming(1, { duration: MOTION.bobMs, easing: easeInOut }),
        -1,
        true,
      );
      glance.value = withRepeat(
        withTiming(1, { duration: MOTION.glanceMs, easing: Easing.linear }),
        -1,
      );
      return () => {
        cancelAnimation(bob);
        cancelAnimation(glance);
      };
    },
    [bob, glance, reduced],
  );
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bob.value * MOTION.bobShare * size }],
  }));
  const glanceStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          (glanceOffset(glance.value) * size) / AGENT_ROLE_AVATAR_VIEWBOX,
      },
    ],
  }));
  return { attach, bobStyle, glanceStyle };
}

type RoleAvatarProps = {
  role: RoleAvatarSource;
  agentId?: AgentId;
  size?: number;
  working?: boolean;
};

export function RoleAvatar({ working = false, ...props }: RoleAvatarProps) {
  return working ? (
    <WorkingRoleAvatar {...props} />
  ) : (
    <AvatarFrame {...props} />
  );
}

function WorkingRoleAvatar(props: Omit<RoleAvatarProps, "working">) {
  const size = props.size ?? DEFAULT_SIZE;
  const { attach, bobStyle, glanceStyle } = useWorkingMotion(size);
  return (
    <Animated.View ref={attach} style={bobStyle}>
      <AvatarFrame
        {...props}
        wrapFace={(face) => (
          <Animated.View style={[StyleSheet.absoluteFill, glanceStyle]}>
            {face}
          </Animated.View>
        )}
      />
    </Animated.View>
  );
}

function AvatarFrame({
  role,
  agentId,
  size = DEFAULT_SIZE,
  wrapFace,
}: Omit<RoleAvatarProps, "working"> & {
  wrapFace?: (face: ReactElement) => ReactElement;
}) {
  const colors = useThemeColors();
  const avatar = resolveAgentRoleAvatar(role);
  const hue = colors[AVATAR_COLOR[avatar.color]];
  const eye = avatarEyeColor(
    hue,
    colors.roleAvatarFace,
    colors.roleAvatarFaceLight,
  );
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
        wrapFace ? (
          <>
            <Svg height={size} viewBox={VIEWBOX} width={size}>
              <Path
                d={AGENT_ROLE_AVATAR_SHAPE_PATHS[avatar.shape]}
                fill={hue}
              />
            </Svg>
            {wrapFace(<AvatarFace avatar={avatar} eye={eye} size={size} />)}
          </>
        ) : (
          <Svg height={size} viewBox={VIEWBOX} width={size}>
            <Path d={AGENT_ROLE_AVATAR_SHAPE_PATHS[avatar.shape]} fill={hue} />
            <AvatarFaceFeatures avatar={avatar} eye={eye} />
          </Svg>
        )
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
